import assert from "node:assert/strict";
import test from "node:test";

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
  const notes = releaseNotesText({
    context: {
      commit: "0123456789abcdef0123456789abcdef01234567",
      version: "0.1.0",
    },
    repository: "antennabench/antennabench",
  });
  assert.match(notes, /complete CDLA-Permissive-2\.0 agreement/);
  assert.match(
    notes,
    /AntennaBench\.app\/Contents\/Resources\/THIRD_PARTY_NOTICES\.txt/,
  );
  assert.match(notes, /THIRD_PARTY_NOTICES\.txt in the Windows installation directory/);
});

test("draft notes explain the unsigned Windows 11 x64 installer", () => {
  const notes = releaseNotesText({
    context: {
      commit: "0123456789abcdef0123456789abcdef01234567",
      version: "0.1.0",
    },
    repository: "antennabench/antennabench",
  });
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
