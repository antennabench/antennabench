# Roadmap

Last reviewed: 2026-07-28

This page summarizes product outcomes. GitHub Issues contain the implementation
scope, dependencies, and acceptance criteria for individual changes.

## Available Now

AntennaBench has a complete local, manual workflow for repeatable
[WSPR sessions](glossary.md#session):

- review the station, antennas, direction, and
  [cycle](glossary.md#wspr-cycle) order before creating a
  session;
- conduct operator-paced cycles with actual WSPR timing, notes, missed or bad
  cycles, and corrections;
- recover an interrupted run without rewriting its evidence history;
- optionally collect local WSJT-X evidence and delayed WSPR.live public spots;
- import supported WSPR.live JSON and Reverse Beacon Network archives;
- inspect conservative descriptive reports; and
- export standalone HTML or a verified copy of the complete
  [session bundle](glossary.md#session-bundle).

The repository can also build verified macOS release inputs for Apple silicon and
Intel. There is not yet a signed public download. `antennabench.com` is the
public information site and canonical sample; it does not offer accounts,
uploads, or report publishing. The separate hosted-sharing foundation remains a
non-public, admission-disabled prototype and is not part of the current product.

The current station workflow uses WSJT-X as an optional companion for local WSPR
evidence and station status. That workflow is workable for maintainer and
internal field use, but coordinating two applications is not the intended public
product experience.

## Current Sequence

### 1. Prove Private Release Publishing

Create the AntennaBench GitHub organization, transfer the repository, establish
the shared organization foundation, and complete the post-transfer security
audit. Then use the current code to produce one signed, notarized, stapled
private draft candidate and independently verify its downloaded bytes,
installation, launch, report, and export behavior.

This phase proves the release machinery. It does not publish or promote the
current companion workflow.

Tracking: [#290](https://github.com/rwjblue/antennabench/issues/290),
[#60](https://github.com/rwjblue/antennabench/issues/60), and
[#36](https://github.com/rwjblue/antennabench/issues/36).

### 2. Make WSPR Native

The primary product path is native audio receive and WSPR decode plus RF-ready
WSPR transmit audio. The first radio boundary uses explicit operator arming,
manual tuning, and VOX; it does not require CAT, PTT, automatic frequency
control, WSPRnet upload, or network connectivity.

macOS is the first implementation and measurement target. Audio, modem, and
evidence interfaces must remain reusable by future iOS and Android clients.
The existing WSJT-X UDP and import paths remain available as compatibility and
fallback modes.

Decoder quality, SNR/drift compatibility, RF conformance, licensing,
distribution, supply-chain, privacy, and bounded-resource questions are gates,
not details to defer until packaging. [Decision
0029](decisions/0029-make-native-wspr-the-primary-product-path.md) records this
direction; [#233](https://github.com/rwjblue/antennabench/issues/233) owns the
validation and implementation breakdown.

### 3. Make The Product Obvious

The Summary should make the primary session-scoped dB result and its principal
limitation understandable at a glance without declaring a universal winner.
The website should show the real application and a concrete workflow rather
than asking newcomers to infer the product from positioning language.

Lightweight rolling feedback replaces a formal artifact-pinning exercise.
Review sessions record the application revision or stable report URL and turn
material misunderstandings into focused work.

Tracking: [#291](https://github.com/rwjblue/antennabench/issues/291),
[#292](https://github.com/rwjblue/antennabench/issues/292),
[#77](https://github.com/rwjblue/antennabench/issues/77), and
[#266](https://github.com/rwjblue/antennabench/issues/266).

### 4. Validate The Native Workflow

Maintainer sessions may continue against the workable companion workflow while
native WSPR is built. External beta begins only after a signed native candidate
can be installed and used without WSJT-X or a development checkout.

The beta covers native audio, manual tune/VOX, local and optional public
evidence, interruption/recovery, Summary and Full evidence interpretation, and
both export paths under the
[reporter-directed privacy policy](field-testing.md).

Tracking: [#75](https://github.com/rwjblue/antennabench/issues/75),
[#78](https://github.com/rwjblue/antennabench/issues/78), and
[#79](https://github.com/rwjblue/antennabench/issues/79).

### 5. Publish And Promote

Only after the native workflow, Summary, signed-release, documentation, and
external-beta gates pass will AntennaBench publish and promote a macOS preview.
That release makes the independently verified download the website's primary
call to action.

Tracking: [#295](https://github.com/rwjblue/antennabench/issues/295).

## Parallel Definition And Communication

- [#293](https://github.com/rwjblue/antennabench/issues/293) defines the first
  App Store-ready mobile product with iOS as the first tested target and Android
  preserved in the architecture.
- [#294](https://github.com/rwjblue/antennabench/issues/294) records and
  publishes a first-comparison walkthrough after the native and Summary
  workflows stabilize.
- The organization work creates a separate hardware repository for PCB, KiCad,
  enclosure, firmware, BLE, BOM, and RF-validation work. This application
  repository will track only the stable app-facing protocol and integration.

## Later Possibilities

Later work may include CAT/PTT or broader rig control, app integration with a
verified BLE antenna switch, live or scheduled RBN acquisition, cross-session
search, optional report sharing, and mobile implementation after its product
decision. These are not part of the first native macOS preview.

Automatic “winner” language remains out of scope until the project has a
validated experiment-design and inference contract plus enough real-session
evidence to justify it.

Rich propagation capture, built-in non-WSPR keying, and the previously designed
hosted account/publishing service are not planned. Their prior issues and ADRs
remain research history. Hosted sharing will be reconsidered only after the
native signed external beta identifies a repeated problem that local standalone
HTML cannot solve; any later experiment will remain optional and will not
replace the local session bundle.
