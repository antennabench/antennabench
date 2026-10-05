import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { authenticateReleaseArtifacts, planDraftMutation, releaseNotesText } from "./desktop-publication.mjs";

const ASSETS = [
  "AntennaBench-0.1.0-SHA256SUMS",
  "AntennaBench-0.1.0-aarch64-apple-darwin.zip",
  "AntennaBench-0.1.0-release-manifest.json",
  "AntennaBench-0.1.0-x86_64-apple-darwin.zip",
  "AntennaBench-0.1.0-x86_64-pc-windows-msvc-setup.exe",
];

const SOURCE = "0123456789abcdef0123456789abcdef01234567";
function downloadedRelease() {
  return {
    complete: { entries: ASSETS, manifest: { tag: "v0.1.0", source_commit: SOURCE } },
    directory: "/downloaded", repository: "antennabench/antennabench",
    tag: "v0.1.0", commit: SOURCE, target: "x86_64-pc-windows-msvc",
  };
}

function notesRequest(macPolicy = "developer-id-notarized") {
  const context = { commit: SOURCE, version: "0.1.0", tag: "v0.1.0" };
  return {
    context,
    repository: "antennabench/antennabench",
    manifest: {
      publishable: true,
      state: "complete",
      source_commit: SOURCE,
      tag: context.tag,
      version: context.version,
      artifacts: ["aarch64-apple-darwin", "x86_64-apple-darwin"].map((target) => ({
        target,
        signature_policy: macPolicy,
        app: {
          architecture: target === "aarch64-apple-darwin" ? "arm64" : "x86_64",
          metadata: {
            build_version: context.version,
            short_version: context.version,
            bundle_identifier: "com.rwjblue.antennabench",
            minimum_macos: "15.0",
            product_name: "AntennaBench",
            executable: "antennabench-desktop",
          },
          signature: macPolicy === "unsigned-macos" ? {
            classification: "ad-hoc",
            code_signature_verified: true,
            authorities: [],
            publishable: true,
            secure_timestamp: false,
            hardened_runtime: false,
            gatekeeper: "not-claimed-unsigned-macos",
            notarization: "not-claimed-unsigned-macos",
          } : {
            classification: "developer-id",
            code_signature_verified: true,
            authorities: ["Developer ID Application: AntennaBench"],
            publishable: true,
            secure_timestamp: true,
            hardened_runtime: true,
            gatekeeper: "accepted",
            notarization: "stapled-and-validated",
          },
          third_party_notices: {
            filename: "THIRD_PARTY_NOTICES.txt",
            sha256: "735de7292f06881314cd7c94270871f67dca34d053f543fc498733205eb6050c",
          },
        },
      })),
    },
  };
}

test("failed provenance never executes the downloaded unsigned installer", async () => {
  const calls = [];
  await assert.rejects(authenticateReleaseArtifacts(downloadedRelease(), {
    authenticate: (filename) => {
      calls.push(filename);
      if (calls.length === 2) throw new Error("attestation rejected");
    },
    inspect: () => { throw new Error("installer must not execute"); },
  }), /attestation rejected/);
  assert.equal(calls.length, 2);
});

test("all assets authenticate against the exact release source and workflow before native inspection", async () => {
  let authenticated = 0;
  await authenticateReleaseArtifacts(downloadedRelease(), {
    authenticate: (_filename, policy) => {
      assert.deepEqual(policy, [
        "--repo", "antennabench/antennabench",
        "--signer-workflow", "antennabench/antennabench/.github/workflows/desktop-release.yml",
        "--source-digest", SOURCE, "--source-ref", "refs/tags/v0.1.0", "--deny-self-hosted-runners",
      ]);
      authenticated++;
    },
    inspect: ({ inspectTarget }) => {
      assert.equal(authenticated, ASSETS.length);
      assert.equal(inspectTarget, "x86_64-pc-windows-msvc");
    },
  });
});

test("a release manifest from another source cannot reach installer inspection", async () => {
  const request = downloadedRelease();
  request.complete.manifest.source_commit = "f".repeat(40);
  await assert.rejects(authenticateReleaseArtifacts(request, {
    authenticate: () => { throw new Error("must reject source first"); },
    inspect: () => { throw new Error("must not execute installer"); },
  }), /does not match the verified tag and source/);
});

for (const target of ["aarch64-apple-darwin", "x86_64-apple-darwin"]) {
  test(`failed provenance cannot reach downloaded ${target} app extraction`, async () => {
    const request = downloadedRelease();
    request.target = target;
    let inspected = false;
    await assert.rejects(authenticateReleaseArtifacts(request, {
      authenticate: (filename) => {
        if (filename.endsWith(`${target}.zip`)) throw new Error("Mac attestation rejected");
      },
      inspect: () => { inspected = true; },
    }), /Mac attestation rejected/);
    assert.equal(inspected, false);
  });
}

test("all assets authenticate before declared unsigned Mac policy reaches native verification", async () => {
  const request = downloadedRelease();
  request.target = "aarch64-apple-darwin";
  request.complete.manifest.artifacts = notesRequest("unsigned-macos").manifest.artifacts;
  const authenticated = [];
  await authenticateReleaseArtifacts(request, {
    authenticate: (filename) => { authenticated.push(filename); },
    inspect: ({ directory, inspectTarget }) => {
      assert.equal(authenticated.length, ASSETS.length);
      assert.equal(directory, request.directory);
      assert.equal(inspectTarget, request.target);
      assert.equal(request.complete.manifest.artifacts[0].signature_policy, "unsigned-macos");
    },
  });
});

test("draft retry policy creates, resumes empty, or verifies an exact set", () => {
  assert.equal(planDraftMutation(null, ASSETS), "create");
  assert.equal(planDraftMutation({ isDraft: true, assets: [] }, ASSETS), "resume-empty");
  assert.equal(
    planDraftMutation({ isDraft: true, assets: ASSETS.map((name) => ({ name })).reverse() }, ASSETS),
    "verify-existing",
  );
});

test("draft retry policy rejects publication and partial or unexpected assets", () => {
  assert.throws(
    () => planDraftMutation({ isDraft: false, assets: ASSETS.map((name) => ({ name })) }, ASSETS),
    /not a draft/,
  );
  assert.throws(
    () => planDraftMutation({ isDraft: true, assets: [{ name: ASSETS[0] }] }, ASSETS),
    /partial or mismatched/,
  );
  assert.throws(
    () => planDraftMutation({ isDraft: true, assets: [...ASSETS, "extra.dmg"].map((name) => ({ name })) }, ASSETS),
    /partial or mismatched/,
  );
});

test("draft notes identify the packaged third-party notices", () => {
  const notes = releaseNotesText(notesRequest());
  assert.match(notes, /complete CDLA-Permissive-2\.0 agreement/);
  assert.match(
    notes,
    /AntennaBench\.app\/Contents\/Resources\/THIRD_PARTY_NOTICES\.txt/,
  );
  assert.match(notes, /THIRD_PARTY_NOTICES\.txt in the Windows installation directory/);
});

test("draft notes explain the unsigned Windows 11 x64 installer", () => {
  const notes = releaseNotesText(notesRequest());
  assert.match(notes, /Windows 11 x64/);
  assert.match(notes, /per-user NSIS installer/);
  assert.match(notes, /offline WebView2 runtime installer/);
  assert.match(notes, /Windows installer and app are unsigned/);
  assert.match(notes, /unknown-publisher or SmartScreen warning/);
  assert.match(notes, /More info → Run anyway/);
  assert.match(notes, /Smart App Control or organization policy may block unsigned apps entirely/);
  assert.match(notes, /Get-FileHash .*x86_64-pc-windows-msvc-setup\.exe -Algorithm SHA256/);
  assert.match(notes, /gh attestation verify AntennaBench-0\.1\.0-x86_64-pc-windows-msvc-setup\.exe/);
  assert.match(notes, /signed with Developer ID, notarized, and stapled/);
  assert.doesNotMatch(notes, /Windows, Linux/);
});

test("unsigned Mac notes disclose the declared policy and app-specific opening option", () => {
  const notes = releaseNotesText(notesRequest("unsigned-macos"));
  assert.match(notes, /Mac apps are not Developer ID signed or notarized/);
  assert.match(notes, /macOS may block their first launch/);
  assert.match(notes, /System Settings → Privacy & Security → Open Anyway/);
  assert.match(notes, /after verifying|After verifying/);
  assert.match(notes, /do not override a malware or damaged-app alert/);
  assert.match(notes, /Managed Macs may prevent opening unsigned apps/);
  assert.match(notes, /https:\/\/support\.apple\.com\/en-us\/102445/);
  assert.doesNotMatch(notes, /Mac apps are signed with Developer ID, notarized, and stapled/);
  assert.doesNotMatch(notes, /Gatekeeper (accepted|passes)|xattr|spctl --master-disable/);
  assert.ok(notes.indexOf("gh attestation verify") < notes.indexOf("Open Anyway"));
  assert.match(notes, /WSJT-X for transmission and decoding/);
  assert.match(notes, /does not generate or decode native WSPR audio/);
  assert.match(notes, /interactive installation.*remain deferred preview work/);
  assert.doesNotMatch(notes, /private draft verification candidate|requires explicit owner promotion after clean-system/);
  assert.match(notes, /shasum -a 256 AntennaBench-0\.1\.0-aarch64-apple-darwin\.zip/);
  assert.match(notes, /For an Intel Mac, replace aarch64-apple-darwin with x86_64-apple-darwin in both commands/);
  assert.doesNotMatch(notes, /shasum -a 256 -c/);
});

test("signed Mac notes retain the verified Developer ID policy without unsigned opening instructions", () => {
  const notes = releaseNotesText(notesRequest());
  assert.match(notes, /Mac apps are signed with Developer ID, notarized, and stapled/);
  assert.doesNotMatch(notes, /Open Anyway|Mac apps are not Developer ID/);
});

test("release notes reject a manifest that does not match the verified release context", () => {
  for (const [key, value] of [
    ["publishable", false], ["state", "partial"], ["tag", "v0.2.0"],
    ["version", "0.2.0"], ["source_commit", "f".repeat(40)],
  ]) {
    const request = notesRequest();
    request.manifest[key] = value;
    assert.throws(() => releaseNotesText(request), /exact tag, version, and source/);
  }
  const request = notesRequest();
  delete request.manifest;
  assert.throws(() => releaseNotesText(request), /verified complete manifest/);
});

test("notes command requires a complete release directory before writing trust claims", () => {
  const script = fileURLToPath(new URL("./desktop-publication.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    script, "notes", "--tag", "v0.1.0", "--output", "/unused-release-notes.md",
  ], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing --release-dir/);
});

test("release notes reject mixed, missing, unknown, or non-publishable Mac policy", () => {
  const mixed = notesRequest();
  mixed.manifest.artifacts[1] = notesRequest("unsigned-macos").manifest.artifacts[1];
  assert.throws(() => releaseNotesText(mixed), /matching Mac signature policies/);
  const missing = notesRequest();
  missing.manifest.artifacts.pop();
  assert.throws(() => releaseNotesText(missing), /both verified Mac artifacts/);
  for (const policy of [undefined, "unreviewed-macos", "local-non-publishable"]) {
    const request = notesRequest(policy);
    request.manifest.artifacts.forEach((artifact) => { artifact.signature_policy = policy; });
    assert.throws(() => releaseNotesText(request));
  }
});

test("release notes reject signing or Gatekeeper claims contradicted by Mac evidence", () => {
  const falseSigned = notesRequest("unsigned-macos");
  falseSigned.manifest.artifacts.forEach((artifact) => { artifact.signature_policy = "developer-id-notarized"; });
  assert.throws(() => releaseNotesText(falseSigned), /publishable signature evidence/);
  const falseGatekeeper = notesRequest("unsigned-macos");
  falseGatekeeper.manifest.artifacts[0].app.signature.gatekeeper = "accepted";
  assert.throws(() => releaseNotesText(falseGatekeeper), /unsigned Mac signature evidence has invalid gatekeeper/);
});
