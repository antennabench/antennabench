import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertVersionTag,
  canonicalJson,
  readCompleteArtifactSet,
  readTargetManifest,
  trustModeForArtifact,
  verifyCompleteArtifacts,
  withAtomicDirectory,
} from "./desktop-release.mjs";
import { nativeWindowsEnvironment } from "./desktop-windows-release.mjs";

const PRODUCT = "AntennaBench";
const MAX_NOTARY_LOG_BYTES = 1_048_576;

export function commandResult(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: nativeWindowsEnvironment(options.env ?? process.env),
    encoding: "utf8",
    timeout: options.timeout ?? 60_000,
  });
  return {
    error: result.error,
    signal: result.signal,
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function commandFailureReason(result) {
  if (result.error) {
    return `${result.error.message}${result.error.code ? ` [${result.error.code}]` : ""}`;
  }
  return result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
}

function capture(command, args, options = {}) {
  const result = commandResult(command, args, options);
  if (result.error || result.signal || result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`.trim();
    const reason = commandFailureReason(result);
    const invocation = options.sensitive ? command : `${command} ${args.join(" ")}`;
    throw new Error(`${invocation} failed (${reason})${output ? `:\n${output}` : ""}`);
  }
  return result.stdout.trim();
}

function workspaceVersion(root) {
  const cargo = fs.readFileSync(path.join(root, "Cargo.toml"), "utf8");
  const section = cargo.match(/\[workspace\.package\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? "";
  const version = section.match(/^version = "([^"]+)"$/m)?.[1];
  if (!version) throw new Error("Cargo.toml workspace package version is missing");
  return version;
}

export function validateTagContext({ root, tag, expectedCommit = process.env.GITHUB_SHA }) {
  const version = workspaceVersion(root);
  assertVersionTag(version, tag);
  const head = capture("git", ["rev-parse", "HEAD"], { cwd: root });
  const taggedCommit = capture("git", ["rev-parse", `${tag}^{commit}`], { cwd: root });
  if (head !== taggedCommit) throw new Error(`tag ${tag} does not identify checked-out commit ${head}`);
  if (expectedCommit && expectedCommit !== head) {
    throw new Error(`expected source ${expectedCommit} does not match checked-out commit ${head}`);
  }
  capture("git", ["merge-base", "--is-ancestor", head, "origin/main"], { cwd: root });
  return { commit: head, tag, version };
}

export async function prepareSigningInput({ input, output, target, tag, expectedCommit }) {
  const record = readTargetManifest(input);
  if (record.manifest.publishable !== false) {
    throw new Error("signing input must be the verified non-publishable artifact from the build job");
  }
  if (record.manifest.contract.target !== target || record.manifest.tag !== tag) {
    throw new Error("signing input target or tag does not match the protected signing job");
  }
  if (record.manifest.source.dirty !== false || record.manifest.source.commit !== expectedCommit) {
    throw new Error("signing input source does not match the clean tagged source revision");
  }
  const archive = path.join(input, record.manifest.artifact.filename);
  await withAtomicDirectory(output, async (staging) => {
    capture("ditto", ["-x", "-k", archive, staging], { timeout: 300_000 });
    const entries = fs.readdirSync(staging);
    if (entries.length !== 1 || entries[0] !== `${PRODUCT}.app`) {
      throw new Error(`signing input archive must contain exactly ${PRODUCT}.app`);
    }
  });
  console.log(`Prepared verified signing input at ${output}`);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`required protected-environment secret ${name} is missing`);
  return value;
}

function writePrivateFile(filename, contents) {
  fs.writeFileSync(filename, contents, { mode: 0o600 });
  fs.chmodSync(filename, 0o600);
}

function developerIdentity(keychain) {
  const output = capture("security", ["find-identity", "-v", "-p", "codesigning", keychain]);
  const identities = [...output.matchAll(/"(Developer ID Application: [^"]+)"/g)].map(
    (match) => match[1],
  );
  if (identities.length !== 1) {
    throw new Error(`certificate must contain exactly one Developer ID Application identity; found ${identities.length}`);
  }
  return identities[0];
}

function assertNoNestedCode(app) {
  for (const relative of ["Frameworks", "PlugIns", "XPCServices", "Helpers"]) {
    const directory = path.join(app, "Contents", relative);
    if (fs.existsSync(directory) && fs.readdirSync(directory).length > 0) {
      throw new Error(`unexpected nested code at Contents/${relative}; add explicit inside-out signing before release`);
    }
  }
}

export async function signAndNotarize({ app, evidenceDirectory }) {
  if (process.platform !== "darwin") throw new Error("Apple signing requires macOS");
  const certificate = requiredEnvironment("APPLE_CERTIFICATE");
  const certificatePassword = requiredEnvironment("APPLE_CERTIFICATE_PASSWORD");
  const issuer = requiredEnvironment("APPLE_API_ISSUER");
  const keyId = requiredEnvironment("APPLE_API_KEY");
  const privateKey = requiredEnvironment("APPLE_API_PRIVATE_KEY");
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("APPLE_API_PRIVATE_KEY must contain the App Store Connect .p8 file contents");
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "antennabench-signing-"));
  const keychain = path.join(temporary, "release.keychain-db");
  const certificateFile = path.join(temporary, "developer-id.p12");
  const privateKeyFile = path.join(temporary, "AuthKey.p8");
  const notarizationArchive = path.join(temporary, `${PRODUCT}-notarization.zip`);
  const keychainPassword = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  try {
    const certificateBytes = Buffer.from(certificate.replace(/\s/g, ""), "base64");
    if (certificateBytes.length === 0) throw new Error("APPLE_CERTIFICATE is not valid base64");
    writePrivateFile(certificateFile, certificateBytes);
    writePrivateFile(privateKeyFile, privateKey);

    capture("security", ["create-keychain", "-p", keychainPassword, keychain], { sensitive: true });
    capture("security", ["set-keychain-settings", "-lut", "21600", keychain], { sensitive: true });
    capture("security", ["unlock-keychain", "-p", keychainPassword, keychain], { sensitive: true });
    capture("security", [
      "import",
      certificateFile,
      "-k",
      keychain,
      "-P",
      certificatePassword,
      "-T",
      "/usr/bin/codesign",
    ], { sensitive: true });
    capture("security", [
      "set-key-partition-list",
      "-S",
      "apple-tool:,apple:",
      "-s",
      "-k",
      keychainPassword,
      keychain,
    ], { sensitive: true });
    const identity = developerIdentity(keychain);
    assertNoNestedCode(app);
    capture("codesign", [
      "--force",
      "--options",
      "runtime",
      "--timestamp",
      "--keychain",
      keychain,
      "--sign",
      identity,
      app,
    ], { timeout: 300_000 });
    capture("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);

    capture("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, notarizationArchive], {
      timeout: 300_000,
    });
    const submissionText = capture("xcrun", [
      "notarytool",
      "submit",
      notarizationArchive,
      "--key",
      privateKeyFile,
      "--key-id",
      keyId,
      "--issuer",
      issuer,
      "--wait",
      "--timeout",
      "30m",
      "--output-format",
      "json",
    ], { timeout: 1_900_000, sensitive: true });
    const submission = JSON.parse(submissionText);
    fs.writeFileSync(path.join(evidenceDirectory, "notarization-submission.json"), canonicalJson(submission));
    if (!submission.id) throw new Error("notarytool did not return a submission id");
    const log = capture("xcrun", [
      "notarytool",
      "log",
      submission.id,
      "--key",
      privateKeyFile,
      "--key-id",
      keyId,
      "--issuer",
      issuer,
    ], { timeout: 300_000, sensitive: true });
    if (Buffer.byteLength(log) > MAX_NOTARY_LOG_BYTES) {
      throw new Error(`notarization log exceeds ${MAX_NOTARY_LOG_BYTES} bytes`);
    }
    fs.writeFileSync(path.join(evidenceDirectory, "notarization-log.json"), `${log}\n`);
    if (submission.status !== "Accepted") {
      throw new Error(`notarization failed with status ${submission.status ?? "unknown"}`);
    }
    capture("xcrun", ["stapler", "staple", app], { timeout: 300_000 });
    capture("xcrun", ["stapler", "validate", app], { timeout: 120_000 });
    fs.writeFileSync(
      path.join(evidenceDirectory, "signing-summary.json"),
      canonicalJson({
        identity,
        notarization_status: submission.status,
        submission_id: submission.id,
      }),
    );
    console.log(`Signed, notarized, and stapled ${app} with ${identity}`);
  } finally {
    commandResult("security", ["delete-keychain", keychain]);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function planDraftMutation(existing, expectedAssets) {
  if (existing === null) return "create";
  if (!existing.isDraft) throw new Error("release already exists and is not a draft");
  const actual = existing.assets.map((asset) => asset.name).sort();
  const expected = [...expectedAssets].sort();
  if (actual.length === 0) return "resume-empty";
  if (JSON.stringify(actual) === JSON.stringify(expected)) return "verify-existing";
  throw new Error(`draft asset set is partial or mismatched: found ${actual.join(", ") || "none"}`);
}

export function releaseView(tag, { repository, cwd, run = commandResult } = {}) {
  const args = ["release", "view", tag, "--json", "assets,isDraft,tagName,url"];
  if (repository) args.push("--repo", repository);
  const result = run("gh", args, { cwd });
  if (result.error || result.signal || result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (!result.error && !result.signal && typeof result.status === "number" && /release not found|not found/i.test(output)) return null;
    throw new Error(`unable to inspect existing release (${commandFailureReason(result)})${output ? `:\n${output}` : ""}`);
  }
  return JSON.parse(result.stdout);
}

function compareDownloadedAssets(directory, complete) {
  const downloaded = readCompleteArtifactSet(directory);
  if (JSON.stringify(downloaded.entries) !== JSON.stringify(complete.entries)) {
    throw new Error("downloaded draft asset set differs from the local complete set");
  }
  for (const filename of complete.entries) {
    const local = fs.readFileSync(path.join(complete.directory, filename));
    const remote = fs.readFileSync(path.join(directory, filename));
    if (!local.equals(remote)) throw new Error(`existing draft asset ${filename} differs from local bytes`);
  }
}

export function publishDraft({ directory, notesFile, root, tag }) {
  validateTagContext({ root, tag });
  const complete = readCompleteArtifactSet(directory);
  complete.directory = directory;
  if (complete.manifest.tag !== tag) throw new Error("complete release set tag does not match requested draft");
  const existing = releaseView(tag);
  const plan = planDraftMutation(existing, complete.entries);
  if (plan === "verify-existing") {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "antennabench-existing-draft-"));
    try {
      capture("gh", ["release", "download", tag, "--dir", temporary], { timeout: 300_000 });
      compareDownloadedAssets(temporary, complete);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
    console.log(existing.url);
    return;
  }
  const assets = complete.entries.map((filename) => path.join(directory, filename));
  if (plan === "create") {
    capture("gh", [
      "release",
      "create",
      tag,
      ...assets,
      "--draft",
      "--verify-tag",
      "--title",
      `${PRODUCT} ${complete.manifest.version}`,
      "--notes-file",
      notesFile,
    ], { timeout: 600_000 });
  } else {
    capture("gh", ["release", "upload", tag, ...assets], { timeout: 600_000 });
    capture("gh", ["release", "edit", tag, "--notes-file", notesFile], { timeout: 120_000 });
  }
  const created = releaseView(tag);
  if (planDraftMutation(created, complete.entries) !== "verify-existing") {
    throw new Error("draft release did not reach the exact complete asset state");
  }
  console.log(created.url);
}

export function writeReleaseNotes({ filename, root, tag, releaseDirectory }) {
  const context = validateTagContext({ root, tag });
  const complete = readCompleteArtifactSet(releaseDirectory);
  const repository =
    process.env.GITHUB_REPOSITORY ?? "antennabench/antennabench";
  const text = releaseNotesText({ context, repository, manifest: complete.manifest });
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, text);
}

export function releaseNotesText({ context, repository, manifest }) {
  if (
    manifest?.publishable !== true ||
    manifest.state !== "complete" ||
    manifest.tag !== context.tag ||
    manifest.version !== context.version ||
    manifest.source_commit !== context.commit
  ) {
    throw new Error("release notes require the verified complete manifest for the exact tag, version, and source");
  }
  const macTargets = ["aarch64-apple-darwin", "x86_64-apple-darwin"];
  const macArtifacts = manifest.artifacts?.filter((artifact) => macTargets.includes(artifact.target)) ?? [];
  if (
    macArtifacts.length !== macTargets.length ||
    !macTargets.every((target) => macArtifacts.some((artifact) => artifact.target === target))
  ) {
    throw new Error("release notes require both verified Mac artifacts");
  }
  const macModes = new Set(macArtifacts.map(trustModeForArtifact));
  if (macModes.size !== 1) throw new Error("release notes require matching Mac signature policies");
  const macMode = [...macModes][0];
  if (!["release", "unsigned-macos"].includes(macMode)) {
    throw new Error("release notes require a publishable Mac signature policy");
  }
  const macTrust = macMode === "release"
    ? "These Mac apps are signed with Developer ID, notarized, and stapled. "
    : "These Mac apps are not Developer ID signed or notarized. macOS may block their first launch. ";
  const macOpening = macMode === "unsigned-macos"
    ? "After verifying the download and trying to open the app, if you trust this release and macOS offers the option, use **System Settings → Privacy & Security → Open Anyway**, then confirm **Open**. " +
      "This grants permission for this app. Apple has not checked this release for malware; do not override a malware or damaged-app alert. Managed Macs may prevent opening unsigned apps. " +
      "See [Apple’s guidance for opening apps](https://support.apple.com/en-us/102445).\n\n"
    : "";
  const promotion = macMode === "unsigned-macos"
    ? "Clean-system interactive installation, native dialogs, full report/export/reopen sessions, upgrades, and external participant validation remain deferred preview work. The automated release checks do not substitute for those observations.\n"
    : "This is a private draft verification candidate. Stable publication requires explicit owner promotion after clean-system install, launch, and canonical open/report/export/reopen verification.\n";
  return `# ${PRODUCT} ${context.version}\n\n` +
    `Source: [${context.commit}](https://github.com/${repository}/commit/${context.commit})\n\n` +
    "This is an early preview for manual WSPR antenna comparisons using WSJT-X for transmission and decoding. It does not generate or decode native WSPR audio.\n\n" +
    `This release contains separate macOS 15+ archives for Apple silicon and Intel Macs. ` +
    macTrust +
    `Download the ZIP matching your Mac, verify the checksums and GitHub attestation, then extract it and move ${PRODUCT}.app to Applications.\n\n` +
    "```sh\n" +
    `shasum -a 256 ${PRODUCT}-${context.version}-aarch64-apple-darwin.zip\n` +
    `gh attestation verify ${PRODUCT}-${context.version}-aarch64-apple-darwin.zip --repo ${repository}\n` +
    "```\n\n" +
    `For an Intel Mac, replace aarch64-apple-darwin with x86_64-apple-darwin in both commands. Compare the SHA256 value with the same ZIP's entry in ${PRODUCT}-${context.version}-SHA256SUMS before extracting it.\n\n` +
    macOpening +
    `Windows 11 x64: download ${PRODUCT}-${context.version}-x86_64-pc-windows-msvc-setup.exe. ` +
    "This per-user NSIS installer includes the offline WebView2 runtime installer and does not require a separate runtime download. " +
    "The Windows installer and app are unsigned; Windows may show an unknown-publisher or SmartScreen warning. " +
    "If SmartScreen offers it, choose **More info → Run anyway** after verifying the downloaded file. Smart App Control or organization policy may block unsigned apps entirely; this distribution does not require disabling those protections.\n\n" +
    "```powershell\n" +
    `Get-FileHash .\\${PRODUCT}-${context.version}-x86_64-pc-windows-msvc-setup.exe -Algorithm SHA256\n` +
    `gh attestation verify ${PRODUCT}-${context.version}-x86_64-pc-windows-msvc-setup.exe --repo ${repository}\n` +
    "```\n\n" +
    `Compare the SHA256 value with the Windows installer entry in ${PRODUCT}-${context.version}-SHA256SUMS, then run the installer.\n\n` +
    `Third-party notices, including the complete CDLA-Permissive-2.0 agreement for the packaged CA-root data, are included in ${PRODUCT}.app/Contents/Resources/THIRD_PARTY_NOTICES.txt on macOS and THIRD_PARTY_NOTICES.txt in the Windows installation directory.\n\n` +
    "Known limitations: macOS 15 or later or Windows 11 x64 is required; Linux, automatic updates, the Mac App Store, and package-manager installation are not included. Windows station-location lookup requires manual grid entry.\n\n" +
    promotion;
}

export async function authenticateReleaseArtifacts(
  { complete, directory, repository, tag, commit, target },
  {
    authenticate = (filename, policy) => capture("gh", ["attestation", "verify", filename, ...policy], { timeout: 300_000 }),
    inspect = verifyCompleteArtifacts,
  } = {},
) {
  if (!repository) throw new Error("GITHUB_REPOSITORY is required for attestation verification");
  if (complete.manifest.tag !== tag || complete.manifest.source_commit !== commit) {
    throw new Error("downloaded release manifest does not match the verified tag and source commit");
  }
  const policy = [
    "--repo", repository,
    "--signer-workflow", `${repository}/.github/workflows/desktop-release.yml`,
    "--source-digest", commit,
    "--source-ref", `refs/tags/${tag}`,
    "--deny-self-hosted-runners",
  ];
  // Authenticate every downloaded byte before native inspection extracts a Mac
  // app or executes the intentionally unsigned Windows installer. The native
  // inspector derives each platform's trust mode from that verified manifest.
  for (const filename of complete.entries) {
    await authenticate(path.join(directory, filename), policy);
  }
  // The publisher authenticates the private draft without extracting or
  // executing any package. Read-only consumers authenticate the handed-off
  // bytes again before selecting a native target to inspect.
  if (target === undefined) return complete;
  return inspect({ directory, inspectTarget: target });
}

function requireExpectedCommit(expectedCommit) {
  if (!/^[0-9a-f]{40}$/.test(expectedCommit ?? "")) {
    throw new Error("an explicit 40-character expected source commit is required for downloaded release verification");
  }
}

export async function downloadDraft(
  { directory, root, tag, expectedCommit, repository = process.env.GITHUB_REPOSITORY },
  {
    validateContext = validateTagContext,
    viewRelease = releaseView,
    download = (releaseTag, output) => capture("gh", ["release", "download", releaseTag, "--repo", repository, "--dir", output], { cwd: root, timeout: 300_000 }),
    authenticate,
  } = {},
) {
  requireExpectedCommit(expectedCommit);
  const context = validateContext({ root, tag, expectedCommit });
  if (!repository) throw new Error("GITHUB_REPOSITORY is required for draft download and attestation verification");
  const existing = viewRelease(tag, { repository, cwd: root });
  if (!existing?.isDraft) throw new Error("expected an existing draft release");
  if (existing.tagName !== tag) throw new Error("draft release tag does not match the requested tag");
  await withAtomicDirectory(directory, async (staging) => {
    await download(tag, staging);
    const complete = readCompleteArtifactSet(staging);
    if (planDraftMutation(existing, complete.entries) !== "verify-existing") {
      throw new Error("draft release does not contain the exact complete asset set");
    }
    await authenticateReleaseArtifacts({ complete, directory: staging, repository, tag, commit: context.commit }, { authenticate });
  });
  const complete = readCompleteArtifactSet(directory);
  console.log(`Downloaded and authenticated private draft ${tag} at ${directory}`);
  return complete;
}

export async function verifyDownloaded(
  { directory, root, tag, target, expectedCommit, repository = process.env.GITHUB_REPOSITORY },
  { validateContext = validateTagContext, authenticate, inspect } = {},
) {
  requireExpectedCommit(expectedCommit);
  const context = validateContext({ root, tag, expectedCommit });
  if (!target) throw new Error("native target is required for downloaded release verification");
  const complete = readCompleteArtifactSet(directory);
  const verified = await authenticateReleaseArtifacts({
    complete, directory, repository,
    tag, commit: context.commit, target,
  }, { authenticate, inspect });
  console.log(`Verified handed-off draft ${tag} for ${target}`);
  return verified;
}

export async function verifyDraft({ directory, root, tag, target, expectedCommit }) {
  const context = validateTagContext({ root, tag, expectedCommit });
  await downloadDraft({ directory, root, tag, expectedCommit: context.commit });
  await verifyDownloaded({ directory, root, tag, target, expectedCommit: context.commit });
  console.log(`Verified downloaded draft ${tag} for ${target}`);
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
    options[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = rest[++index];
  }
  return options;
}

function requireOption(options, name) {
  if (!options[name]) throw new Error(`missing --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  return options[name];
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = options.root ? path.resolve(options.root) : process.cwd();
  if (options.command === "validate-tag") {
    validateTagContext({ root, tag: requireOption(options, "tag") });
  } else if (options.command === "prepare") {
    await prepareSigningInput({
      input: path.resolve(requireOption(options, "input")),
      output: path.resolve(requireOption(options, "output")),
      target: requireOption(options, "target"),
      tag: requireOption(options, "tag"),
      expectedCommit: requireOption(options, "expectedCommit"),
    });
  } else if (options.command === "sign") {
    await signAndNotarize({
      app: path.resolve(requireOption(options, "app")),
      evidenceDirectory: path.resolve(requireOption(options, "evidence")),
    });
  } else if (options.command === "notes") {
    writeReleaseNotes({
      filename: path.resolve(requireOption(options, "output")),
      releaseDirectory: path.resolve(requireOption(options, "releaseDir")),
      root,
      tag: requireOption(options, "tag"),
    });
  } else if (options.command === "publish-draft") {
    publishDraft({
      directory: path.resolve(requireOption(options, "input")),
      notesFile: path.resolve(requireOption(options, "notes")),
      root,
      tag: requireOption(options, "tag"),
    });
  } else if (options.command === "verify-draft") {
    await verifyDraft({
      directory: path.resolve(requireOption(options, "output")),
      root,
      tag: requireOption(options, "tag"),
      target: requireOption(options, "target"),
      expectedCommit: options.expectedCommit,
    });
  } else if (options.command === "download-draft") {
    await downloadDraft({
      directory: path.resolve(requireOption(options, "output")),
      root,
      tag: requireOption(options, "tag"),
      expectedCommit: requireOption(options, "expectedCommit"),
    });
  } else if (options.command === "verify-downloaded") {
    await verifyDownloaded({
      directory: path.resolve(requireOption(options, "input")),
      root,
      tag: requireOption(options, "tag"),
      target: requireOption(options, "target"),
      expectedCommit: requireOption(options, "expectedCommit"),
    });
  } else {
    throw new Error("usage: desktop-publication.mjs validate-tag|prepare|sign|notes|publish-draft|download-draft|verify-downloaded|verify-draft [options]");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
