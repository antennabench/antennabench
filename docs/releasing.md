# Desktop Releases

AntennaBench's release contract includes separate signed ZIP archives for
Apple-silicon and Intel Macs running macOS 15 or later, plus an unsigned per-user
NSIS installer for Windows 11 x64. The Windows installer includes the offline
Evergreen WebView2 Runtime installer and needs no paid signing service.
[Decision 0030](decisions/0030-ship-unsigned-windows-x64-installers.md) records
this platform-specific trust policy. Public downloads remain pending private
draft proof and the owner promotion gates below.

A push of an existing stable
`vMAJOR.MINOR.PATCH` tag starts `.github/workflows/desktop-release.yml`. The
workflow can create or verify a private GitHub draft; it cannot publish a
stable release. Stable promotion is always an explicit repository-owner action.

## One-Time Owner Setup

Create a protected GitHub environment named `desktop-release` before running
the credentialed path. Configure at least one required reviewer and restrict
deployment tags to `v*`. Store exactly these environment secrets:

| Secret | Contents |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password for that `.p12` |
| `APPLE_API_ISSUER` | App Store Connect API issuer UUID |
| `APPLE_API_KEY` | App Store Connect API key ID |
| `APPLE_API_PRIVATE_KEY` | Unmodified multiline contents of the API `.p8` file |

Do not use repository-level secrets for these values. Pull requests, ordinary
CI, attestation, draft publication, and draft verification do not receive the
environment or its secrets. Only the native macOS signing jobs reference them.
Each imports the certificate into a random temporary keychain, writes the private
key to a mode-0600 temporary file, and removes both in a `finally` cleanup.

Before the first public promotion, complete the owner security settings tracked
in issue #60, including GitHub immutable releases and the reviewed Actions and
ruleset configuration. Creating credentials, changing environment protection,
and enabling those repository settings require the owner; they are not release
workflow steps.

## Candidate Procedure

1. Confirm `main` is green, the working copy is clean, and the Cargo workspace
   version is the intended stable `MAJOR.MINOR.PATCH` value.
2. Create the matching `vMAJOR.MINOR.PATCH` tag at a commit reachable from
   `origin/main`, then push that tag. Do not reuse a retired release tag.
3. Review the `desktop-release` environment deployment. Confirm the tag, source
   commit, requested version, and expected three-target matrix before approving.
4. Wait for all three downloaded-draft verification jobs to pass. A completed run
   has created a private draft, not a public release.

Before credential access, the workflow independently checks the exact tag,
workspace version, source commit, reachability from `origin/main`, tool pins,
dependency policy, and fresh advisory data. It then builds each target on
its native runner and transfers only the explicit non-publishable install artifact and
manifest from the non-secret build. Protected macOS jobs verify that manifest
before importing Apple credentials. Windows follows the same tagged identity
and preflight checks without accessing those credentials.

The native build injects that same verified version, tag, clean source commit,
target triple, and compile architecture into schema-v6 runtime identity. The
desktop build fails if any injected release value disagrees with Cargo or the
checked-out source. A build timestamp is recorded only when the workflow
explicitly provides `SOURCE_DATE_EPOCH`; wall-clock compile time is never used.

Each macOS app is Developer ID signed with hardened runtime and a secure
timestamp, submitted with `notarytool`, stapled, and checked with strict `codesign`,
`stapler`, and Gatekeeper verification. Windows verification silently installs
the NSIS package into an isolated per-user destination, checks the installed x64
PE executable's product/version metadata and packaged notices, confirms both the
installer and executable are unsigned, proves a native window and WebView2
process start, and uninstalls it. This check requires a clean Windows user;
existing AntennaBench installations, running processes, or application data are
not suitable verification inputs.

Assembly accepts three publishable target manifests with one version, tag, and
source commit. The final set is exactly:

```text
AntennaBench-<version>-aarch64-apple-darwin.zip
AntennaBench-<version>-x86_64-apple-darwin.zip
AntennaBench-<version>-x86_64-pc-windows-msvc-setup.exe
AntennaBench-<version>-release-manifest.json
AntennaBench-<version>-SHA256SUMS
```

GitHub build provenance is generated for all five files before the draft
mutation job receives `contents: write`. That is the only write permission in
the workflow. The final native jobs download the actual draft assets and repeat
checksum, manifest, native packaging, embedded metadata, architecture,
platform trust, packaged third-party-notice, and attestation checks. Macs must
again pass signature, staple, and Gatekeeper checks; Windows must again pass
unsigned-state, installation, launch, and uninstall checks. The exact reviewed
`THIRD_PARTY_NOTICES.txt` must be present in `Contents/Resources/` on macOS and
beside the installed executable on Windows, including the complete
CDLA-Permissive-2.0 agreement for the packaged CA-root data.

## Independent Download And Installation Check

Download all five assets from the draft to a new directory. On macOS, verify the
exact bytes before extracting an archive:

```bash
shasum -a 256 -c AntennaBench-<version>-SHA256SUMS
gh attestation verify AntennaBench-<version>-aarch64-apple-darwin.zip \
  --repo antennabench/antennabench
gh attestation verify AntennaBench-<version>-x86_64-apple-darwin.zip \
  --repo antennabench/antennabench
```

Choose `aarch64-apple-darwin` for Apple silicon or
`x86_64-apple-darwin` for an Intel Mac. Extract the matching ZIP, move
`AntennaBench.app` to `/Applications`, and launch it normally. On a clean
supported Mac, confirm Gatekeeper does not require a security bypass. Run the
canonical open → report → export → reopen scenario with the maintained sample
bundle and record the machine architecture, macOS version, tag, source commit,
downloaded checksums, attestation output, launch result, and exported/reopened
result in the release issue.

On Windows 11 x64, verify checksums from PowerShell and the installer provenance:

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
The application executable and installer are unsigned. Windows may show an
unknown-publisher or SmartScreen warning. Smart App Control or managed policy
may block the installer or app. Use only the verified project release asset;
the project does not recommend disabling Windows security or using a policy
override.

On a clean Windows 11 machine, record the exact OS version, x64 architecture,
tag, source commit, checksums, attestations, installer and launch result, native
open/save dialog behavior, rendered report, exported/reopened session, upgrade,
and uninstall. Verify runtime installation without a separate download when
WebView2 is absent. Station-location lookup is currently macOS-only; enter the
station grid manually on Windows.

The unattended desktop workflow exercises application boundaries without
opening a window. Native installer/launch automation adds packaging evidence,
but clean-system interactive behavior remains human release evidence on every
supported user platform. Do not promote based only on CI.

## Promotion

Review the draft notes and exact asset list after the clean-system check. Confirm
the macOS signing summaries and complete notarization logs retained by the
workflow, Windows unsigned-state and installation evidence, all three native
downloaded-draft jobs, the checksum results, and GitHub attestations. Existing
product gates for public promotion also remain in force.
Then use GitHub's release UI to publish the existing draft as a stable release.
Do not select a prerelease channel. This manual action is the stable-promotion
approval and must occur only after immutable releases are enabled.

## Retry, Failure, And Withdrawal

Concurrency is serialized per tag. A retry may create a missing draft, fill an
existing empty draft, or verify an already complete draft whose five assets are
byte-identical. It fails on a partial asset set, an unexpected asset, different
bytes, or an already published release. No command uses overwrite or clobber.

If upload fails after leaving a partial draft, preserve the workflow and
notarization logs, record the failure, delete the entire misleading draft after
review, and rerun the same tag workflow. Do not delete individual assets to
manufacture a resumable state. Fix source, version, signing, or artifact defects
under a new version and tag.

A published release is never edited in place. Mark a defective release as
withdrawn in the surrounding project communication, retire its tag permanently,
and publish a corrected higher version. Treat unexpected signing or notarization
activity as a credential incident.

## Credential Rotation And Troubleshooting

Rotate the Developer ID certificate or App Store Connect key in Apple-managed
administration, replace all related environment secrets together, and prove the
new set with a draft before revoking the old material. If a credential may be
exposed, revoke it first, rotate the environment values, audit recent Apple and
GitHub activity, and do not retry with the suspect credential.

Common failures are intentionally terminal:

- A tag/version/source failure means the tag or Cargo version is wrong, or the
  tag is not reachable from `main`.
- A missing protected secret or approval requires owner environment action; do
  not add a repository-secret fallback.
- Multiple Developer ID identities or newly embedded frameworks require an
  explicit reviewed signing update; the current task refuses blanket deep
  signing.
- Notarization failures retain bounded submission JSON and the complete bounded
  notary log as workflow artifacts. Resolve Apple's reported finding before a
  new attempt.
- Checksum, manifest, macOS trust, Windows unsigned-state/installation, or
  attestation disagreement means the candidate is not releasable. Never bypass
  the failed check.
- A partial or mismatched draft requires the reviewed whole-draft cleanup above;
  it is never silently overwritten.
