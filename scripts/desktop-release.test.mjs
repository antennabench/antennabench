import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  archiveName,
  assembleArtifacts,
  assertStableVersion,
  assertPublishableSource,
  assertVersionTag,
  canonicalJson,
  checksumLines,
  inspectThirdPartyNotices,
  inspectMacSignature,
  readCompleteArtifactSet,
  readTargetManifest,
  resolveReleaseIdentityTag,
  sealMacAppAdHoc,
  sourceEvidence,
  signaturePolicyForTrustMode,
  targetContract,
  trustModeForArtifact,
  trustModeForManifest,
  validateStagedEntries,
  withAtomicDirectory,
} from "./desktop-release.mjs";

const NOTICE_SHA256 = "735de7292f06881314cd7c94270871f67dca34d053f543fc498733205eb6050c";
const WINDOWS_TARGET = "x86_64-pc-windows-msvc";
const RELEASE_TARGETS = ["aarch64-apple-darwin", "x86_64-apple-darwin", WINDOWS_TARGET];
const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

function macEvidence(target, policy = "developer-id-notarized", classification = "ad-hoc") {
  const signed = policy === "developer-id-notarized";
  return {
    architecture: targetContract(target).architecture,
    metadata: {
      build_version: "0.1.0", short_version: "0.1.0", bundle_identifier: "com.rwjblue.antennabench",
      minimum_macos: "15.0", product_name: "AntennaBench", executable: "antennabench-desktop",
    },
    third_party_notices: { filename: "THIRD_PARTY_NOTICES.txt", sha256: NOTICE_SHA256 },
    signature: {
      authorities: signed ? ["Developer ID Application: Example (TEAMID)"] : [],
      classification: signed ? "developer-id" : classification,
      code_signature_verified: signed || classification === "ad-hoc",
      gatekeeper: signed ? "accepted" : "not-claimed-unsigned-macos",
      hardened_runtime: signed,
      notarization: signed ? "stapled-and-validated" : "not-claimed-unsigned-macos",
      publishable: true,
      secure_timestamp: signed,
    },
  };
}

function targetFixture(root, target, policy = target === WINDOWS_TARGET ? "unsigned" : "unsigned-macos") {
  const directory = path.join(root, "inputs", target);
  fs.mkdirSync(directory, { recursive: true });
  const filename = archiveName("0.1.0", target);
  fs.writeFileSync(path.join(directory, filename), target);
  const manifest = {
    app: target === WINDOWS_TARGET ? windowsEvidence() : macEvidence(target, policy),
    artifact: { filename, sha256: crypto.createHash("sha256").update(target).digest("hex"), size: Buffer.byteLength(target) },
    build_inputs: { target }, contract: { target, signature_policy: policy }, publishable: true, schema_version: 1,
    source: { commit: SOURCE_COMMIT, dirty: false }, state: "complete", tag: "v0.1.0", version: "0.1.0",
  };
  writeTargetFixture(directory, manifest);
  return { directory, manifest };
}

function writeTargetFixture(directory, manifest) {
  fs.writeFileSync(path.join(directory, "artifact-manifest.json"), canonicalJson(manifest));
}

function rewriteCompleteManifest(directory, manifest) {
  const manifestName = `AntennaBench-${manifest.version}-release-manifest.json`;
  const text = canonicalJson(manifest);
  fs.writeFileSync(path.join(directory, manifestName), text);
  fs.writeFileSync(path.join(directory, `AntennaBench-${manifest.version}-SHA256SUMS`), checksumLines([
    ...manifest.artifacts.map(({ filename, sha256 }) => [filename, sha256]),
    [manifestName, crypto.createHash("sha256").update(text).digest("hex")],
  ]));
}

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
          contract: { target, signature_policy: signaturePolicyForTrustMode(target, "local") },
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
        contract: { target, signature_policy: "developer-id-notarized" },
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
          app: target === WINDOWS_TARGET ? windowsEvidence() : macEvidence(target),
          artifact: {
            filename,
            sha256: crypto.createHash("sha256").update(target).digest("hex"),
            size: Buffer.byteLength(target),
          },
          build_inputs: { target },
          contract: { target, signature_policy: target === WINDOWS_TARGET ? "unsigned" : "developer-id-notarized" },
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
        contract: { target, signature_policy: target === WINDOWS_TARGET ? "unsigned" : "developer-id-notarized" }, publishable: true, schema_version: 1,
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

test("publishable Mac trust modes require an explicit policy and clean matching source tag", () => {
  const target = "aarch64-apple-darwin";
  assert.equal(signaturePolicyForTrustMode(target, "local"), "local-non-publishable");
  assert.equal(signaturePolicyForTrustMode(target, "release"), "developer-id-notarized");
  assert.equal(signaturePolicyForTrustMode(target, "unsigned-macos"), "unsigned-macos");
  assert.throws(() => signaturePolicyForTrustMode(WINDOWS_TARGET, "unsigned-macos"), /requires a Mac target/);
  assert.throws(() => signaturePolicyForTrustMode(target, "unsigned"), /unsupported trust mode/);
  const valid = { source: { commit: SOURCE_COMMIT, dirty: false }, tag: "v0.1.0", version: "0.1.0" };
  assert.doesNotThrow(() => assertPublishableSource(valid));
  for (const invalid of [
    { ...valid, tag: undefined }, { ...valid, tag: null }, { ...valid, tag: "v0.1.1" },
    { ...valid, source: { commit: SOURCE_COMMIT, dirty: true } },
    { ...valid, source: { commit: "", dirty: false } },
  ]) assert.throws(() => assertPublishableSource(invalid), /publishable input requires/);
  assert.equal(trustModeForManifest({ contract: { target, signature_policy: "local-non-publishable" }, publishable: false, app: { signature: { publishable: false } } }), "local");
  for (const policy of [undefined, "local-non-publishable", "unsigned", "anything"]) {
    assert.throws(() => trustModeForArtifact({ target, signature_policy: policy, app: macEvidence(target, "unsigned-macos") }), /requires declared/);
  }
});

test("unsigned Mac inspection permits truly unsigned apps and verifies ad-hoc signatures without claiming Apple trust", () => {
  const commands = [];
  const verify = (command, args) => { commands.push([command, ...args]); };
  const unsigned = inspectMacSignature("AntennaBench.app", "unsigned-macos", {
    readSignature: () => ({ ok: false, status: 1, output: "AntennaBench.app: code object is not signed at all" }), verify,
  });
  assert.equal(unsigned.classification, "unsigned");
  assert.equal(unsigned.publishable, true);
  assert.equal(unsigned.code_signature_verified, false);
  assert.equal(unsigned.gatekeeper, "not-claimed-unsigned-macos");
  assert.equal(unsigned.notarization, "not-claimed-unsigned-macos");
  assert.equal(unsigned.secure_timestamp, false);
  assert.deepEqual(commands, []);
  const adhoc = inspectMacSignature("AntennaBench.app", "unsigned-macos", {
    readSignature: () => ({ ok: true, output: "Signature=adhoc\nflags=0x0(none)\nTimestamp=none\n" }), verify,
  });
  assert.equal(adhoc.code_signature_verified, true);
  assert.equal(adhoc.classification, "ad-hoc");
  assert.deepEqual(commands, [["codesign", "--verify", "--deep", "--strict", "--verbose=2", "AntennaBench.app"]]);
  assert.throws(() => inspectMacSignature("AntennaBench.app", "unsigned-macos", {
    readSignature: () => ({ ok: true, output: "Signature=adhoc\n" }),
    verify: () => { throw new Error("invalid signature (code or signature have been modified)"); },
  }), /invalid signature/);
});

test("unsigned Mac inspection rejects signing authorities and ambiguous codesign failures", () => {
  for (const output of ["Authority=Developer ID Application: Example (TEAMID)\n", "Signature=adhoc\nAuthority=Unexpected authority\n", "Signature=other\n"]) {
    assert.throws(() => inspectMacSignature("AntennaBench.app", "unsigned-macos", {
      readSignature: () => ({ ok: true, output }),
      verify: () => assert.fail("unexpected signature must not proceed to verification"),
    }), /requires an unsigned or ad-hoc/);
  }
  for (const result of [
    { ok: false, status: 1, output: "invalid signature" },
    { ok: false, status: 2, output: "code object is not signed at all" },
    { ok: false, status: null, output: "", error: "ETIMEDOUT" },
  ]) assert.throws(() => inspectMacSignature("AntennaBench.app", "unsigned-macos", { readSignature: () => result }), /could not determine/);
});

test("unsigned Mac inspection rejects unexpected timestamp evidence before verifying or declaring publication", () => {
  for (const timestamps of [
    "Timestamp=Oct 5, 2026 at 12:00:00\n",
    "Timestamp=Oct 5, 2026 at 12:00:00\r\n",
    "Timestamp=\n",
    "Timestamp=none\nTimestamp=Oct 5, 2026 at 12:00:00\n",
  ]) {
    assert.throws(() => inspectMacSignature("AntennaBench.app", "unsigned-macos", {
      readSignature: () => ({ ok: true, output: `Signature=adhoc\n${timestamps}` }),
      verify: () => assert.fail("unexpected timestamp must be rejected before integrity verification"),
    }), /forbids a secure timestamp/);
  }
});

test("ad-hoc bundle sealing uses only a local identity and fails on unhandled nested code or invalid seals", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-adhoc-seal-"));
  const app = path.join(root, "AntennaBench.app");
  const commands = [];
  const run = (command, args, options) => commands.push({ command, args, options });
  try {
    fs.mkdirSync(path.join(app, "Contents"), { recursive: true });
    sealMacAppAdHoc(app, { run });
    assert.deepEqual(commands, [
      { command: "codesign", args: ["--force", "--sign", "-", "--timestamp=none", app], options: { timeout: 300_000 } },
      { command: "codesign", args: ["--verify", "--deep", "--strict", "--verbose=2", app], options: undefined },
    ]);
    for (const relative of ["Frameworks", "PlugIns", "XPCServices", "Helpers"]) {
      const nested = path.join(app, "Contents", relative);
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, "unexpected-code"), "unexpected nested code");
      assert.throws(() => sealMacAppAdHoc(app, {
        run: () => assert.fail("unhandled nested code must be rejected before sealing"),
      }), /explicit inside-out integrity sealing is required/);
      fs.rmSync(nested, { recursive: true });
    }
    for (const failedOperation of ["--sign", "--verify"]) {
      const attempted = [];
      assert.throws(() => sealMacAppAdHoc(app, { run: (command, args) => {
        attempted.push(args);
        if (args.includes(failedOperation)) throw new Error(`codesign ${failedOperation} failed`);
      } }), new RegExp(`codesign ${failedOperation} failed`));
      assert.equal(attempted.length, failedOperation === "--sign" ? 1 : 2);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("signed Mac inspection retains signature, notarization and Gatekeeper validation", () => {
  const commands = [];
  const signedOutput = "Authority=Developer ID Application: Example (TEAMID)\nflags=0x10000(runtime)\nTimestamp=Oct 5, 2026 at 12:00:00\n";
  const result = inspectMacSignature("AntennaBench.app", "release", {
    readSignature: () => ({ ok: true, output: signedOutput }),
    verify: (command, args) => commands.push([command, ...args]),
  });
  assert.equal(result.publishable, true);
  assert.equal(result.code_signature_verified, true);
  assert.equal(result.notarization, "stapled-and-validated");
  assert.equal(result.gatekeeper, "accepted");
  assert.deepEqual(commands.map(([command]) => command), ["codesign", "xcrun", "spctl"]);
  for (const output of ["Signature=adhoc\n", signedOutput.replace("flags=0x10000(runtime)", "flags=0x0(none)"), signedOutput.replace(/Timestamp=.+/, "Timestamp=none")]) {
    assert.throws(() => inspectMacSignature("AntennaBench.app", "release", { readSignature: () => ({ ok: true, output }) }), /requires Developer ID|hardened runtime|secure timestamp/);
  }
});

test("unsigned Mac manifests reject forged trust, identity, source, architecture and notice evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-unsigned-evidence-"));
  try {
    const { directory, manifest } = targetFixture(root, "aarch64-apple-darwin");
    assert.equal(trustModeForManifest(readTargetManifest(directory).manifest), "unsigned-macos");
    const changes = [
      (value) => { value.app.signature = { publishable: true }; },
      (value) => { value.app.signature.classification = "developer-id"; },
      (value) => { value.app.signature.authorities = ["Developer ID Application: Example"]; },
      (value) => { value.app.signature.code_signature_verified = false; },
      (value) => { value.app.signature.gatekeeper = "accepted"; },
      (value) => { value.app.signature.notarization = "stapled-and-validated"; },
      (value) => { value.app.signature.secure_timestamp = true; },
      (value) => { value.app.architecture = "x86_64"; },
      (value) => { value.app.metadata.minimum_macos = "14.0"; },
      (value) => { value.app.metadata.executable = "../elsewhere"; },
      (value) => { value.app.metadata.short_version = "0.1.1"; },
      (value) => { value.app.third_party_notices.sha256 = "0".repeat(64); },
      (value) => { value.source.dirty = true; },
      (value) => { value.tag = null; },
      (value) => { delete value.contract.signature_policy; },
      (value) => { value.contract.signature_policy = "developer-id-notarized"; },
    ];
    for (const change of changes) {
      const forged = structuredClone(manifest);
      change(forged);
      writeTargetFixture(directory, forged);
      assert.throws(() => readTargetManifest(directory));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("assembly and complete-set verification accept declared unsigned Mac policy and reject mixed or forged policies", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-unsigned-complete-"));
  try {
    const fixtures = RELEASE_TARGETS.map((target) => targetFixture(root, target));
    fixtures[0].manifest.app = macEvidence(RELEASE_TARGETS[0], "unsigned-macos", "unsigned");
    writeTargetFixture(fixtures[0].directory, fixtures[0].manifest);
    const output = await assembleArtifacts({ root, inputs: fixtures.map(({ directory }) => directory), requirePublishable: true });
    const complete = readCompleteArtifactSet(output);
    assert.deepEqual(complete.manifest.artifacts.map(trustModeForArtifact), ["unsigned-macos", "unsigned-macos", "release"]);
    assert.equal(complete.entries.length, 5);
    const mixed = structuredClone(fixtures[1].manifest);
    mixed.contract.signature_policy = "developer-id-notarized";
    mixed.app = macEvidence(RELEASE_TARGETS[1]);
    writeTargetFixture(fixtures[1].directory, mixed);
    await assert.rejects(assembleArtifacts({ root, inputs: fixtures.map(({ directory }) => directory), requirePublishable: true }), /signature policies disagree/);
    for (const change of [
      (value) => { value.artifacts[0].signature_policy = "unknown"; },
      (value) => { value.artifacts[0].app.signature.gatekeeper = "accepted"; },
      (value) => { value.artifacts[0].app.signature = { publishable: true }; },
      (value) => { value.artifacts[0].signature_policy = "developer-id-notarized"; value.artifacts[0].app = macEvidence(RELEASE_TARGETS[0]); },
      (value) => { value.tag = null; },
      (value) => { value.source_commit = ""; },
    ]) {
      const forged = structuredClone(complete.manifest);
      change(forged);
      rewriteCompleteManifest(output, forged);
      assert.throws(() => readCompleteArtifactSet(output));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
