# 0031: Ship Unsigned macOS Early Previews

Date: 2026-10-05

Amends the macOS trust and preview-promotion contract in
[Decision 0007](0007-ship-separate-signed-macos-release-archives.md) and
[Decision 0030](0030-ship-unsigned-windows-x64-installers.md).

## Decision

The owner has explicitly authorized publishing the current WSJT-X companion
early preview without Apple signing credentials. Keep separate macOS 15
Apple-silicon and Intel ZIP archives and the Windows 11 x64 NSIS installer,
with their existing filenames, native runners, minimum versions, embedded
identity, notices, checksums, and GitHub attestations.

The current Mac policy is explicitly `unsigned-macos`. It accepts only unsigned
or ad-hoc code, without Developer ID authority or a secure timestamp. Official
builds deliberately apply and strictly verify a local ad-hoc bundle integrity
seal after Tauri's `--no-sign` build. This uses no Apple signing account and
does not identify a developer.
Verification records notarization and Gatekeeper as
`not-claimed-unsigned-macos`. The workflow does not notarize or staple these
apps, claim Apple malware screening, or require Gatekeeper acceptance.

The official tagged path stages this selected policy into publishable output.
Local and CI probes remain `local-non-publishable` with `NON_PUBLISHABLE.txt`;
unsigned bytes alone never make a probe publishable.
PR probes can exercise unsigned-Mac staging in scratch output, while uploading
only the original non-publishable artifact directory. Target manifests record
`contract.signature_policy`, and each complete-manifest Mac artifact records
`signature_policy`. Assembly rejects mixed Mac policies, unknown policies, and
evidence inconsistent with the selected policy.

Developer ID distribution remains a separate `developer-id-notarized` policy
with all original authority, hardened-runtime, timestamp, signature,
notarization, staple, and Gatekeeper checks. Its helpers remain available, but
the current workflow has no Apple environment, secret, or approval dependency.
A future signed workflow requires a reviewed switch; credential failures must
never select unsigned publication automatically.

## Installation And Public Claims

Release notes and the project download page clearly disclose that current Mac
apps are not Developer ID signed or notarized and may be blocked at first
launch. Checksums and GitHub attestations establish byte integrity and build
provenance; they are not Apple developer identity or notarization.

Users who trust a verified project download may follow Apple's app-specific
**Privacy & Security → Open Anyway** flow when macOS offers it. Documentation
must not recommend disabling Gatekeeper, stripping quarantine attributes, or
overriding malware or damaged-app alerts. Managed policies may prevent launch.

The site discovers only complete immutable public releases and uses generic
Mac app ZIP labels rather than inferring signing from an archive or GitHub
release metadata. Current unsigned guidance is explicit; a future signing
switch must update that copy in the same reviewed change.

## Early-Preview Promotion Boundary

Publish this owner-authorized preview after green CI, fresh supply-chain
preflight, native packaging, all three downloaded-draft verifications,
checksums, and attestations. Keep publication an explicit owner action and
the five-file release immutable. Use a new version and tag for this policy;
leave the abandoned `v0.1.0` tag unchanged.

Clean-system interactive and external participant validation has not been
performed by this decision. Document it as deferred preview work rather than
claiming CI supplied it or retaining signed-Gatekeeper acceptance as an
unsigned-preview prerequisite. Unattended application tests and Windows native
installer/launch checks have specific automated scopes. Native dialogs, a full
operator report/export/reopen session, clean first-launch security behavior,
upgrades, uninstall, and missing-WebView2 installation need actual recorded
results before claiming completed field validation.

This preview uses WSJT-X for WSPR transmission and decoding. It does not close
the native-WSPR product path or external-beta gates in
[Decision 0029](0029-make-native-wspr-the-primary-product-path.md).

## Consequences

- Current release construction needs no paid Apple signing membership or
  signing credentials.
- macOS and Windows security warnings remain visible product limitations.
- The archive and provenance checks remain mandatory; the new policy does not
  weaken Developer ID mode or silently promote ordinary probes.
- Public release evidence distinguishes automated checks from deferred human
  observations, while permitting the expressly requested early-preview release.
