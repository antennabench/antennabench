# 0029: Make Native WSPR The Primary Product Path

Date: 2026-07-28

## Status

Accepted. Implementation is pending under
[#233](https://github.com/rwjblue/antennabench/issues/233).

This decision selects the product and system boundary. It does not select a
modem implementation, approve a production dependency, change the distributed
product license, or declare any generated waveform ready for RF use.

## Context

AntennaBench currently provides a workable local workflow with WSJT-X as a
companion application. AntennaBench owns the experiment plan, directed cycle
timing, operator readiness, antenna occupancy, durable evidence, recovery,
analysis, reporting, and export. WSJT-X supplies audio capture/playback, WSPR
decode and waveform generation, and optional station and public-upload
behavior.

That division allowed the complete experiment workflow to ship without first
building a modem. It also requires an operator to configure, understand, and
coordinate two applications that do not share one product state. A newcomer
must understand which application owns timing, transmission, monitoring,
upload, radio state, and recovery. The companion can also compete for a CAT
connection even though AntennaBench's ordinary manual path does not require
radio control.

The first independent newcomer review on 2026-07-28 confirmed that this
coordination cost obscures an otherwise workable application flow. The same
review also reinforced that a public artifact should not be promoted until the
application can deliver its selected WSPR workflow without requiring WSJT-X.

Future mobile clients cannot assume that a separately installed desktop
companion exists. A native boundary therefore needs to be useful on macOS first
without making the domain or evidence model macOS-specific.

## Decision

Native WSPR is the primary product path. The first promotion-capable slice
includes both:

1. native audio receive and WSPR decode; and
2. independently validated, RF-ready WSPR transmit audio.

The first station-control boundary is deliberately narrow:

- the operator explicitly authorizes and arms transmit behavior;
- the operator tunes the radio;
- VOX may key the radio from the selected audio output;
- AntennaBench provides visible cancellation and lifecycle revocation; and
- AntennaBench does not require CAT, PTT, automatic tuning, or automatic radio
  state correction.

Native operation must remain useful without network connectivity. Local native
decodes and coherent local adapter evidence are sufficient inputs to a complete
session. WSPR.live remains an optional delayed public read source. It is not an
upload endpoint or the authority for local operation. WSPRnet or other provider
upload requires a documented permitted contract and a separate decision.

The audio, modem, timing, and evidence interfaces must be platform-neutral.
macOS is the first implementation and measurement target, but the boundary must
be reusable by iOS and Android clients without creating a second modem or
durable evidence model.

WSJT-X UDP intake, `ALL_WSPR.TXT` import, and historical bundle behavior remain
supported compatibility and fallback paths. Native evidence uses its own
provider/adapter identity; it is not silently relabeled as WSJT-X evidence or
cross-source deduplicated.

The private release-publishing proof may proceed against the current code and
companion workflow. Public download promotion waits for the native slice,
Summary comprehension, trustworthy candidate, documentation, and external
native-workflow beta gates tracked by
[#295](https://github.com/rwjblue/antennabench/issues/295).

Before production integration, #233 must resolve:

- decoder quality and SNR/drift compatibility;
- transmit timing, spectrum, level, and RF conformance;
- audio permissions, routes, diagnostics, interruption, and recovery;
- bounded resource use, raw or near-raw retention, privacy, and replay;
- exact dependency and supply-chain behavior; and
- modem architecture and distributed-product licensing consequences.

The selected modem packaging and licensing boundary requires a follow-up ADR or
an explicit amendment to this record. No implementation work under this
decision may obscure a license change or treat decoder-test audio as
transmission-ready.

## Consequences

- The project has one clear independence gate instead of treating native WSPR
  as an unspecified later possibility.
- Website download promotion and the external beta target the native workflow;
  maintainer/internal validation may continue with the implemented companion
  path.
- Native receive alone can land as an internal implementation phase, but it
  does not satisfy the selected promotion-capable product slice.
- The first native product can remain manually tuned and VOX-operated; CAT/PTT
  complexity is not allowed to delay independence.
- Offline sessions retain a complete local evidence path and do not depend on
  a volunteer network service.
- The modem and audio layer becomes a material safety, licensing, packaging,
  performance, and mobile-architecture responsibility.
- WSJT-X compatibility remains maintained rather than being removed during the
  transition.

## Options Considered

| Option | Result | Rationale |
| --- | --- | --- |
| Keep WSJT-X companion mode as the primary product | Rejected | The workflow functions, but coordinating two applications remains a major newcomer and mobile-product burden. |
| Native receive only | Rejected as the promotion gate | It reduces one dependency but does not let AntennaBench conduct the selected transmit comparison without a companion. |
| Native RX and RF-ready TX with manual tuning/VOX | Selected | Removes the required companion while keeping radio authority and the first implementation boundary narrow. |
| Add CAT/PTT with the first native slice | Deferred | Control capability, consent, read-back, failure, hardware, and packaging concerns are separable from modem independence. |
| Make a browser/WebAssembly application the first native target | Deferred | Browser audio, persistence, permission, mobile lifecycle, and distribution constraints need separate evidence; the reusable core boundary leaves this option open. |
| Build mobile first | Deferred | macOS provides the first controlled implementation and measurement environment; the shared boundary still must preserve iOS and Android. |

## Relationship To Existing Decisions

- [Decision 0001](0001-bundle-is-source-of-truth.md) remains unchanged: native
  audio/modem state becomes attributed bundle evidence, not a second source of
  truth.
- [Decision 0015](0015-use-an-import-first-wspr-public-spot-boundary.md) remains
  unchanged: WSPR.live is optional delayed public evidence and local sessions
  remain complete without it.
- [Decision 0017](0017-use-operator-paced-wspr-cycles.md) continues to define
  operator readiness and WSPR timing semantics.
- [Decision 0019](0019-observe-rig-state-before-control.md) continues to defer
  direct frequency, mode, PTT, and general rig control.
- [Decision 0021](0021-use-command-verified-antenna-control.md) remains the
  authority for optional antenna-controller commands and read-back.
- [#293](https://github.com/rwjblue/antennabench/issues/293) defines the first
  App Store-ready mobile product within this shared boundary.
