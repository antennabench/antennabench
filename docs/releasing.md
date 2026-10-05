# Desktop Releases

AntennaBench's current early-preview release contract includes separate ZIP
archives for Apple-silicon and Intel Macs running macOS 15 or later, plus an
unsigned per-user NSIS installer for Windows 11 x64. Mac apps are not Developer
ID signed or notarized; the bundle receives a local ad-hoc integrity seal with
no Apple developer identity. The Windows installer includes the offline
Evergreen WebView2 Runtime installer. Neither
platform requires purchased signing credentials for this preview.
[Decision 0031](decisions/0031-ship-unsigned-macos-early-previews.md) records the
current macOS and promotion policy, amending Decisions 0007 and 0030.

The product remains an early preview for manual WSPR comparisons with WSJT-X
as the transmission and decoding companion. Publishing this preview does not
claim native WSPR audio or completed external-beta and clean-system field
validation.

A push of an existing stable `vMAJOR.MINOR.PATCH` tag starts
`.github/workflows/desktop-release.yml`. The workflow creates or verifies a
private GitHub draft; public promotion remains an explicit repository-owner
action. The current tagged path needs no Apple environment, secrets, or signing
approval. Existing signing helpers remain available for a future reviewed
policy change; the workflow does not silently fall back between trust modes.

## Owner Setup And Candidate Procedure

Confirm immutable releases and the reviewed Actions and ruleset settings tracked
in issue #60 before publication. Then:

1. Confirm `main` is green, the working copy is clean, and the Cargo workspace
   version is the intended stable `MAJOR.MINOR.PATCH` value.
2. Create and push the matching tag at a commit reachable from `origin/main`.
   Never move or reuse a release tag. The abandoned `v0.1.0` tag remains intact;
   the unsigned-Mac policy starts with the new `v0.1.1` candidate.
3. Confirm the tag, source commit, version, native runners, and explicit Mac
   `unsigned-macos` policy in the workflow evidence.
4. Wait for all three downloaded-draft verification jobs to pass. A completed
   run has created a private draft, not a public release.

Before building, the workflow independently checks the exact tag, workspace
version, source commit, reachability from `origin/main`, tool pins, dependency
policy, and fresh advisory data. Each target builds on its native runner:
`macos-15`, `macos-15-intel`, or `windows-2025`.

The native build injects the verified version, tag, clean source commit, target
triple, and architecture into schema-v6 runtime identity. It fails if an
injected release value disagrees with Cargo or the checked-out source. A build
timestamp is recorded only when `SOURCE_DATE_EPOCH` is explicitly supplied.

Mac staging checks the application metadata, single Mach-O architecture,
deployment target, packaged notices, signature classification, ZIP structure,
and the extracted representation. The `unsigned-macos` policy permits only
unsigned or ad-hoc code with no Developer ID authority or secure timestamp. It
still strictly verifies an ad-hoc signature when present, and does not claim
Apple notarization, a staple, or Gatekeeper acceptance. Official builds
deliberately seal the whole Mac bundle ad-hoc after Tauri's `--no-sign` build;
this verifies bundle integrity without Apple credentials. Signed release mode
remains a separate contract with its original strict checks.

Windows verification silently installs the NSIS package into an isolated
per-user destination, checks the installed x64 PE executable's product/version
metadata and exact notices, confirms the installer and executable are unsigned,
proves a native window and WebView2 process start, and uninstalls it. This
requires a clean Windows test user; existing AntennaBench installations,
processes, or application data are refused.

Assembly accepts exactly one publishable artifact for each target, with one
version, tag, source commit, and consistent Mac signature policy. Each Mac
artifact records `signature_policy: unsigned-macos` or
`developer-id-notarized`; mixed or unknown policies fail. Routine probes remain
non-publishable even when their signature classification matches a release.
PR probes may also exercise unsigned-Mac release staging in scratch output;
only the original non-publishable target directory is uploaded as a probe.
The final set is exactly:

```text
AntennaBench-<version>-aarch64-apple-darwin.zip
AntennaBench-<version>-x86_64-apple-darwin.zip
AntennaBench-<version>-x86_64-pc-windows-msvc-setup.exe
AntennaBench-<version>-release-manifest.json
AntennaBench-<version>-SHA256SUMS
```

GitHub build provenance covers all five files before the draft job receives
`contents: write`; it is the only job with contents-write permission. Downloaded-draft jobs
authenticate the exact source and attestations before native inspection, then
repeat checksums, manifest, package, embedded metadata, architecture, notices,
and the selected platform trust checks. The reviewed
`THIRD_PARTY_NOTICES.txt` must be in `Contents/Resources/` on macOS and beside
the executable on Windows, including the complete CDLA-Permissive-2.0 agreement
for the packaged CA-root data.

## Download Verification And Installation

Download all five assets to a new directory. On macOS, verify the exact bytes
before extracting an archive:

```bash
shasum -a 256 -c AntennaBench-<version>-SHA256SUMS
gh attestation verify AntennaBench-<version>-aarch64-apple-darwin.zip \
  --repo antennabench/antennabench
gh attestation verify AntennaBench-<version>-x86_64-apple-darwin.zip \
  --repo antennabench/antennabench
```

Choose `aarch64-apple-darwin` for Apple silicon or `x86_64-apple-darwin` for
Intel. Extract the matching ZIP and move `AntennaBench.app` to `/Applications`.
These Mac downloads are not Developer ID signed or notarized, so macOS may
block the first launch and Apple cannot verify that the app is free of malware.
The local ad-hoc bundle seal does not identify its developer or provide
notarization.

After trying to open the app, if you trust this verified project download and
macOS offers the option, open **System Settings → Privacy & Security → Open
Anyway**, then confirm **Open**. This grants permission for this app; managed
Mac policies may prevent it. Follow [Apple's guidance for apps from an unknown
developer](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).
Do not override a malware or damaged-app alert. The project does not recommend
disabling Gatekeeper or removing quarantine attributes.

On Windows 11 x64, verify all downloaded assets from PowerShell and check the
installer provenance:

```powershell
Get-Content "AntennaBench-<version>-SHA256SUMS" | ForEach-Object {
  $digest, $name = $_ -split '  ', 2
  if ((Get-FileHash -LiteralPath $name -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) {
    throw "Checksum mismatch: $name"
  }
}
gh attestation verify AntennaBench-<version>-x86_64-pc-windows-msvc-setup.exe `
  --repo antennabench/antennabench
```

Run the `setup.exe` installer as the intended user, then launch AntennaBench.
The installer and application are unsigned. Windows may show an
unknown-publisher or SmartScreen warning; Smart App Control or managed policy
may block them. Use only the verified project asset. The project does not
recommend disabling Windows security or overriding managed policy. Enter the
station grid manually on Windows; automatic location lookup is macOS-only.

## Preview Promotion And Remaining Validation

The owner has authorized publication of the current unsigned WSJT-X companion
preview after its CI, fresh preflight, native package, downloaded-byte, and
attestation checks pass. Review the draft notes and exact five assets, confirm
both Mac manifests explicitly use `unsigned-macos`, and confirm all three
native downloaded-draft jobs. Publish the existing immutable draft through
GitHub's release UI. Do not select the prerelease channel; the stable tag syntax
does not change the product's early-preview status.

Clean-system interactive validation remains deferred work, not evidence that
automation supplied. The unattended desktop workflow exercises application
boundaries without opening a window. Windows installer automation adds native
installation, basic launch, and teardown evidence; it does not prove an entire
operator session on a clean user machine. Record only checks actually performed
in release evidence, and disclose the remaining limitations in release notes.

Before claiming completed field validation, use clean supported Mac and Windows
systems to check first-launch security prompts, native open/save dialogs,
rendered reports, canonical open → report → export → reopen behavior, upgrades,
and uninstall. On Windows, also check installation when WebView2 is absent.
Record OS version, architecture, tag, source commit, downloaded checksums,
attestations, and actual results. Existing native-WSPR and external-beta work
remains open; this preview does not substitute for participant observations or
close those product gates.

## Retry, Failure, And Withdrawal

Concurrency is serialized per tag. A retry may create a missing draft, fill an
empty draft, or verify a complete draft whose five assets are byte-identical.
It fails on a partial set, unexpected assets, different bytes, or an already
published release. No command overwrites or clobbers an asset.

If upload leaves a partial draft, preserve logs, record the failure, delete the
entire misleading draft after review, and rerun the same tag workflow. Do not
delete individual assets to manufacture a resumable state. Fix source, version,
trust-policy, or artifact defects under a new version and tag.

A published release is never edited in place. Mark a defective release as
withdrawn in project communication, retire its tag, and publish a corrected
higher version. Checksum, manifest, native package, selected trust-policy, or
attestation disagreement makes a candidate unreleasable; resolve the failure
instead of bypassing it.

## Future Developer ID Releases

Re-enabling signed Mac releases requires a reviewed workflow and website policy
change. Configure the protected `desktop-release` environment for `v*` tags
with reviewer approval and the environment-only secrets `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, and
`APPLE_API_PRIVATE_KEY`. Routine CI and unsigned release jobs must not access
them. The existing signing helpers isolate credentials in a temporary keychain
and mode-0600 key file and clean up afterward.

Signed mode must retain Developer ID authority, hardened runtime, secure
timestamp, strict recursive signature verification, Apple notarization,
stapling, and Gatekeeper acceptance of the extracted public archive. Missing or
invalid credentials are failures in that mode, never triggers for an automatic
unsigned fallback. The public site currently uses generic Mac ZIP labels and
explicit unsigned-preview guidance; update that guidance in the same reviewed
change that switches release policy.
