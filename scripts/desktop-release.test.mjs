import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  archiveName,
  assembleArtifacts,
  assertStableVersion,
  assertVersionTag,
  canonicalJson,
  checksumLines,
  inspectThirdPartyNotices,
  readCompleteArtifactSet,
  readTargetManifest,
  resolveReleaseIdentityTag,
  sourceEvidence,
  targetContract,
  validateStagedEntries,
  withAtomicDirectory,
} from "./desktop-release.mjs";

const NOTICE_SHA256 = "735de7292f06881314cd7c94270871f67dca34d053f543fc498733205eb6050c";
const WINDOWS_TARGET = "x86_64-pc-windows-msvc";
const RELEASE_TARGETS = ["aarch64-apple-darwin", "x86_64-apple-darwin", WINDOWS_TARGET];

test("Git source identity treats warning-only stderr as clean and retains diagnostics", () => {
  const commit = "a".repeat(40);
  const diagnostics = [];
  const commands = [];
  const source = sourceEvidence("unused", {
    expectedCommit: commit,
    reportDiagnostic: (message) => diagnostics.push(message),
    runGit: (args) => {
      commands.push(args);
      return args[0] === "rev-parse"
        ? { ok: true, stdout: `${commit}\r\n`, stderr: "" }
        : { ok: true, stdout: "", stderr: "warning: LF will be replaced by CRLF\r\n" };
    },
  });
  assert.deepEqual(source, { commit, dirty: false });
  assert.deepEqual(commands, [["rev-parse", "HEAD"], ["status", "--porcelain"]]);
  assert.match(diagnostics.join("\n"), /warning: LF will be replaced by CRLF/);
});

test("Git source changes remain dirty with changed paths and tracked diff diagnostics", () => {
  const commit = "b".repeat(40);
  const diagnostics = [];
  const source = sourceEvidence("unused", {
    expectedCommit: commit,
    reportDiagnostic: (message) => diagnostics.push(message),
    runGit: (args) => ({
      ok: true,
      stdout: args[0] === "rev-parse" ? `${commit}\n`
        : args[0] === "status" ? " M apps/desktop/tauri.conf.json\r\n?? unexpected.txt\r\n"
          : " apps/desktop/tauri.conf.json | 2 +-\n",
      stderr: args[0] === "status" ? "warning: Git status diagnostic\n" : "",
    }),
  });
  assert.deepEqual(source, { commit, dirty: true });
  assert.match(diagnostics.join("\n"), / M apps\/desktop\/tauri\.conf\.json\r?\n\?\? unexpected\.txt/);
  assert.match(diagnostics.join("\n"), /tauri\.conf\.json \| 2 \+-/);
});

test("Git source identity fails closed when status fails", () => {
  const commit = "c".repeat(40);
  assert.throws(() => sourceEvidence("unused", {
    expectedCommit: commit,
    reportDiagnostic: () => assert.fail("failed Git status must not become a warning-only clean state"),
    runGit: (args) => args[0] === "rev-parse"
      ? { ok: true, stdout: commit, stderr: "" }
      : { ok: false, status: 128, stdout: "", stderr: "fatal: cannot read index" },
  }), /git status --porcelain failed \(exit 128\):\nfatal: cannot read index/);
});

function windowsEvidence() {
  const signature = { authorities: [], classification: "unsigned", publishable: true, secure_timestamp: false };
  return {
    architecture: "x86_64",
    metadata: { build_version: "0.1.0", short_version: "0.1.0", minimum_windows: "11" },
    signature,
    executable_signature: { ...signature },
  };
}

test("accepts stable versions and exact v-prefixed tags", () => {
  assert.equal(assertStableVersion("0.1.0"), "0.1.0");
  assert.doesNotThrow(() => assertVersionTag("12.34.56", "v12.34.56"));
  for (const version of ["01.2.3", "1.2", "1.2.3-beta.1", "v1.2.3"]) {
    assert.throws(() => assertStableVersion(version), /stable MAJOR\.MINOR\.PATCH/);
  }
  assert.throws(() => assertVersionTag("1.2.3", "v1.2.4"), /does not match/);
});

test("omitted probe tags resolve to exact official release identity", () => {
  assert.equal(resolveReleaseIdentityTag("0.1.0"), "v0.1.0");
  assert.equal(resolveReleaseIdentityTag("12.34.56", "v12.34.56"), "v12.34.56");
  assert.throws(
    () => resolveReleaseIdentityTag("1.2.3", "v1.2.4"),
    /does not match/,
  );
});

test("probe and tagged workflows preserve their distinct tag inputs", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const probe = fs.readFileSync(
    path.join(root, ".github", "workflows", "desktop-release-artifacts.yml"),
    "utf8",
  );
  const release = fs.readFileSync(
    path.join(root, ".github", "workflows", "desktop-release.yml"),
    "utf8",
  );
  const probeCommand = probe.match(/run: mise run desktop:release-bundle[^\n]+/)?.[0] ?? "";
  assert.match(probeCommand, /--runner-label/);
  assert.doesNotMatch(probeCommand, /--tag/);
  assert.match(
    release,
    /mise run desktop:release-bundle --[\s\S]*?--tag "\$\{\{ github\.ref_name \}\}"/,
  );
});

test("target contracts make arm64 and Intel artifact names truthful", () => {
  assert.deepEqual(targetContract("aarch64-apple-darwin"), {
    architecture: "arm64",
    runner: "macos-15",
  });
  assert.deepEqual(targetContract("x86_64-apple-darwin"), {
    architecture: "x86_64",
    runner: "macos-15-intel",
  });
  assert.equal(
    archiveName("0.1.0", "aarch64-apple-darwin"),
    "AntennaBench-0.1.0-aarch64-apple-darwin.zip",
  );
  assert.equal(
    archiveName("0.1.0", "x86_64-apple-darwin"),
    "AntennaBench-0.1.0-x86_64-apple-darwin.zip",
  );
  assert.deepEqual(targetContract(WINDOWS_TARGET), { architecture: "x86_64", runner: "windows-2025" });
  assert.equal(archiveName("0.1.0", WINDOWS_TARGET), "AntennaBench-0.1.0-x86_64-pc-windows-msvc-setup.exe");
  assert.throws(() => archiveName("0.1.0", "aarch64-pc-windows-msvc"), /unsupported release target/);
});

test("manifest JSON and checksum entries use stable bytewise ordering", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}\n');
  assert.equal(
    checksumLines([
      ["z.zip", "bbb"],
      ["A.json", "aaa"],
    ]),
    "aaa  A.json\nbbb  z.zip\n",
  );
});

test("staging rejects unexpected public assets", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-assets-"));
  try {
    fs.writeFileSync(path.join(directory, "expected.zip"), "zip");
    assert.doesNotThrow(() => validateStagedEntries(directory, ["expected.zip"]));
    fs.writeFileSync(path.join(directory, "unexpected.dmg"), "dmg");
    assert.throws(
      () => validateStagedEntries(directory, ["expected.zip"]),
      /staged asset set mismatch/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("packaged third-party notices are exact and tamper evident", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-notices-"));
  const resources = path.join(root, "AntennaBench.app", "Contents", "Resources");
  fs.mkdirSync(resources, { recursive: true });
  const source = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "apps",
    "desktop",
    "THIRD_PARTY_NOTICES.txt",
  );
  const packaged = path.join(resources, "THIRD_PARTY_NOTICES.txt");
  try {
    fs.copyFileSync(source, packaged);
    assert.deepEqual(inspectThirdPartyNotices(path.join(root, "AntennaBench.app")), {
      filename: "THIRD_PARTY_NOTICES.txt",
      sha256: NOTICE_SHA256,
    });
    fs.appendFileSync(packaged, "\ntampered\n");
    assert.throws(
      () => inspectThirdPartyNotices(path.join(root, "AntennaBench.app")),
      /does not match the reviewed release notice/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("failed atomic staging leaves neither a final nor partial directory", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-atomic-"));
  const finalDirectory = path.join(root, "complete");
  fs.mkdirSync(finalDirectory);
  fs.writeFileSync(path.join(finalDirectory, "stale.zip"), "stale");
  await assert.rejects(
    withAtomicDirectory(finalDirectory, async (staging) => {
      fs.writeFileSync(path.join(staging, "partial.zip"), "partial");
      throw new Error("injected failure");
    }),
    /injected failure/,
  );
  assert.equal(fs.existsSync(finalDirectory), false);
  assert.deepEqual(fs.readdirSync(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test("assembly emits the exact Mac archives and Windows installer manifest and checksum set", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-assemble-"));
  try {
    const inputs = [];
    for (const target of RELEASE_TARGETS) {
      const directory = path.join(root, "inputs", target);
      fs.mkdirSync(directory, { recursive: true });
      const filename = archiveName("0.1.0", target);
      fs.writeFileSync(path.join(directory, filename), target);
      const digest = await import("node:crypto").then(({ default: crypto }) =>
        crypto.createHash("sha256").update(target).digest("hex"),
      );
      fs.writeFileSync(
        path.join(directory, "artifact-manifest.json"),
        canonicalJson({
          app: { signature: { publishable: false } },
          artifact: { filename, sha256: digest, size: Buffer.byteLength(target) },
          build_inputs: { target },
          contract: { target },
          publishable: false,
          schema_version: 1,
          source: { commit: "0123456789abcdef0123456789abcdef01234567" },
          state: "complete",
          tag: "v0.1.0",
          version: "0.1.0",
        }),
      );
      fs.writeFileSync(path.join(directory, "NON_PUBLISHABLE.txt"), "local\n");
      inputs.push(directory);
    }
    const output = await assembleArtifacts({ root, inputs });
    validateStagedEntries(output, [
      "AntennaBench-0.1.0-SHA256SUMS",
      "AntennaBench-0.1.0-aarch64-apple-darwin.zip",
      "AntennaBench-0.1.0-release-manifest.json",
      "AntennaBench-0.1.0-x86_64-apple-darwin.zip",
      "AntennaBench-0.1.0-x86_64-pc-windows-msvc-setup.exe",
      "NON_PUBLISHABLE.txt",
    ]);
    await assert.rejects(
      assembleArtifacts({ root, inputs, requirePublishable: true }),
      /requires publishable target artifacts/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("assembly does not trust a forged publishable flag", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-trust-"));
  try {
    const target = "aarch64-apple-darwin";
    const directory = path.join(root, target);
    fs.mkdirSync(directory, { recursive: true });
    const filename = archiveName("0.1.0", target);
    fs.writeFileSync(path.join(directory, filename), target);
    const crypto = await import("node:crypto").then(({ default: value }) => value);
    fs.writeFileSync(
      path.join(directory, "artifact-manifest.json"),
      canonicalJson({
        app: { signature: { publishable: false } },
        artifact: {
          filename,
          sha256: crypto.createHash("sha256").update(target).digest("hex"),
          size: Buffer.byteLength(target),
        },
        contract: { target },
        publishable: true,
        schema_version: 1,
        source: { commit: "0123456789abcdef0123456789abcdef01234567", dirty: false },
        state: "complete",
        tag: "v0.1.0",
        version: "0.1.0",
      }),
    );
    await assert.rejects(
      assembleArtifacts({ root, inputs: [directory, directory] }),
      /publishable state disagrees/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("complete-set verification rechecks exact publishable bytes and trust evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-complete-"));
  try {
    const crypto = await import("node:crypto").then(({ default: value }) => value);
    const inputs = [];
    for (const target of RELEASE_TARGETS) {
      const directory = path.join(root, "inputs", target);
      fs.mkdirSync(directory, { recursive: true });
      const filename = archiveName("0.1.0", target);
      fs.writeFileSync(path.join(directory, filename), target);
      fs.writeFileSync(
        path.join(directory, "artifact-manifest.json"),
        canonicalJson({
          app: target === WINDOWS_TARGET ? windowsEvidence() : {
            metadata: { build_version: "0.1.0", short_version: "0.1.0" },
            signature: {
              authorities: ["Developer ID Application: Example (TEAMID)"],
              classification: "developer-id",
              gatekeeper: "accepted",
              hardened_runtime: true,
              notarization: "stapled-and-validated",
              publishable: true,
              secure_timestamp: true,
            },
          },
          artifact: {
            filename,
            sha256: crypto.createHash("sha256").update(target).digest("hex"),
            size: Buffer.byteLength(target),
          },
          build_inputs: { target },
          contract: { target },
          publishable: true,
          schema_version: 1,
          source: {
            commit: "0123456789abcdef0123456789abcdef01234567",
            dirty: false,
          },
          state: "complete",
          tag: "v0.1.0",
          version: "0.1.0",
        }),
      );
      inputs.push(directory);
    }
    const output = await assembleArtifacts({ root, inputs, requirePublishable: true });
    assert.equal(readCompleteArtifactSet(output).entries.length, 5);
    const installer = path.join(output, archiveName("0.1.0", WINDOWS_TARGET));
    const original = fs.readFileSync(installer);
    fs.appendFileSync(installer, "tampered");
    assert.throws(() => readCompleteArtifactSet(output), /does not match the release manifest/);
    fs.writeFileSync(installer, original);
    fs.appendFileSync(path.join(output, "AntennaBench-0.1.0-SHA256SUMS"), "unexpected\n");
    assert.throws(() => readCompleteArtifactSet(output), /does not exactly match/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("unsigned Windows permission cannot authorize unsigned Mac archives or false signing evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-platform-policy-"));
  const crypto = await import("node:crypto").then(({ default: value }) => value);
  try {
    function fixture(target, app) {
      const directory = path.join(root, target);
      fs.mkdirSync(directory, { recursive: true });
      const filename = archiveName("0.1.0", target);
      fs.writeFileSync(path.join(directory, filename), target);
      const manifest = {
        app,
        artifact: { filename, sha256: crypto.createHash("sha256").update(target).digest("hex"), size: Buffer.byteLength(target) },
        contract: { target }, publishable: true, schema_version: 1,
        source: { commit: "0123456789abcdef0123456789abcdef01234567", dirty: false },
        state: "complete", tag: "v0.1.0", version: "0.1.0",
      };
      fs.writeFileSync(path.join(directory, "artifact-manifest.json"), canonicalJson(manifest));
      return directory;
    }
    const app = windowsEvidence();
    assert.doesNotThrow(() => readTargetManifest(fixture(WINDOWS_TARGET, app)));
    assert.throws(() => readTargetManifest(fixture("aarch64-apple-darwin", app)), /invalid classification/);
    for (const field of ["signature", "executable_signature"]) {
      const forged = windowsEvidence();
      forged[field].classification = "authenticode";
      assert.throws(() => readTargetManifest(fixture(WINDOWS_TARGET, forged)), /explicit unsigned/);
    }
    const incomplete = windowsEvidence();
    delete incomplete.executable_signature;
    assert.throws(() => readTargetManifest(fixture(WINDOWS_TARGET, incomplete)), /explicit unsigned/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
