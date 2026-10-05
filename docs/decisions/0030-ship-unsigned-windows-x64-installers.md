# 0030: Ship Unsigned Windows x64 Installers

Date: 2026-10-04

Amends the platform and asset contract in
[Decision 0007](0007-ship-separate-signed-macos-release-archives.md).
The macOS trust and early-preview promotion requirements below are subsequently
amended by [Decision 0031](0031-ship-unsigned-macos-early-previews.md). The
original decision is retained as historical context; current release procedure
lives in [Desktop Releases](../releasing.md).

## Decision

Desktop releases will include Windows 11 x64 alongside the separate macOS 15
Apple-silicon and Intel application archives. The Windows Rust target is
`x86_64-pc-windows-msvc`, built and verified on the native `windows-2025` runner.
The runner is build infrastructure; Windows 11 is the supported user platform.
Windows ARM64, Windows 10, and Linux releases remain deferred.

The Windows artifact is a per-user NSIS installer named:

```text
AntennaBench-<version>-x86_64-pc-windows-msvc-setup.exe
```

It includes the offline Evergreen WebView2 Runtime installer so installation
does not require a separate runtime download. Tauri inherits the application
version from the Cargo workspace. The executable and installer are deliberately
unsigned: Windows signing is not a prerequisite for this release contract and
the project does not purchase signing credentials. Release notes disclose the
unsigned status and the Windows warning users may see. Smart App Control or
managed Windows policy may prevent installation or execution of unsigned
applications. This distribution does not require disabling those protections.

This is an explicit Windows trust policy, not a fallback after a signing
failure. Release verification requires unsigned Authenticode state for both the
installer and installed executable. It also checks the executable's x64 PE
architecture, product and version metadata, exact third-party notices, and
native installation and launch. A future signing policy requires a focused
decision; it must not silently change the artifact contract.

The macOS requirements remain Developer ID signing, hardened runtime, secure
timestamp, notarization, stapling, strict signature verification, and Gatekeeper
assessment. Apple credentials remain confined to the protected native macOS
jobs. Windows builds and verification need no release credentials.

## Shared Release Set And Promotion

Each complete release has exactly five project-produced assets: the two macOS
ZIP archives, the Windows installer, the release manifest, and `SHA256SUMS`.
The manifest records each platform's minimum supported OS, target, architecture,
digest, size, compiler, and verified trust state. Checksums cover all three
install artifacts and the manifest; GitHub build provenance covers all five
files.

Routine artifact probes remain non-publishable on every platform. An unsigned
Windows installer becomes publishable only after the official tagged path
verifies the Windows release policy. Assembly accepts exactly one artifact per
target with identical application version, tag, and source commit. It never
promotes a probe artifact solely because its bytes are unsigned.

The workflow creates or verifies a private draft and checks the downloaded
assets on all three native targets. The owner must still prove clean-system
installation, launch, native dialogs, report rendering, export/reopen, upgrade,
and uninstall on Windows 11 before public promotion. The unattended desktop
workflow exercises application boundaries without opening a window and cannot
substitute for that evidence. Existing release and product gates still apply,
and stable publication remains an explicit owner action.

Automatic station-location lookup remains macOS-only. Windows operators enter
the station grid manually.

## Consequences

- Windows distribution adds no signing subscription or certificate fee.
- The larger installer includes its runtime installation dependency.
- Windows may show an unknown-publisher or SmartScreen warning; checksums and
  GitHub attestations establish downloaded-byte integrity and provenance, not
  Windows publisher reputation.
- Native Windows packaging and downloaded-draft verification are required;
  portable compile checks alone remain insufficient release evidence.
- Public downloads remain unavailable until the private draft proof, owner
  settings, clean-machine checks, and product promotion gates are complete.
