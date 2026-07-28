# Newcomer Feedback Roadmap Design

Date: 2026-07-28

## Purpose

Turn the first broad newcomer feedback session into a current, low-ceremony
product roadmap and a coherent GitHub issue graph.

The session involved a software developer and amateur-radio operator who had no
prior AntennaBench exposure and no WSJT-X/WSPR operating experience. It was
formative product feedback, not antenna-performance evidence or formal
scientific validation.

No GitHub issue, comment, label, milestone, organization, repository, or
maintained product document is changed merely by approving this design. Those
mutations occur only after the owner reviews this committed specification.

## Product Decisions

### Release publishing

Finish and prove the existing macOS release-publishing machinery against the
current code. The proof produces a private signed, notarized, stapled draft
candidate and verifies its downloaded bytes and installation path.

That candidate is not the external beta and is not publicly promoted.

### Public-promotion gate

AntennaBench will not be publicly promoted until its primary workflow no longer
requires WSJT-X as a companion application.

The first sidecar-free boundary is:

- native audio receive and WSPR decoding;
- native WSPR transmit-audio generation suitable for over-the-air use;
- manual radio tuning and VOX as the initial radio-control boundary;
- no required CAT, PTT, or WSPRnet upload;
- local evidence sufficient for offline operation;
- optional network acquisition kept separate from local evidence; and
- an architecture that preserves iOS and Android paths while delivering and
  validating macOS first.

Existing WSJT-X support remains a fallback and compatibility path, not the
primary promoted workflow.

### External beta

The external operator beta waits for both:

- the current release-publishing proof; and
- the native WSPR receive/decode and transmit-audio workflow.

### Report validation

Report-comprehension work uses lightweight rolling feedback. Each session
records the reviewed application/report revision or URL, reviewer experience,
material misunderstandings, useful elements, and dispositions.

Separate artifact hashing and a rigid identical-task participant matrix are not
required. False-conclusion risks still require a focused fix or explicit owner
disposition.

## Roadmap Sequence

1. Establish the AntennaBench GitHub organization and transfer the current
   repository.
2. Re-audit repository and release settings after the transfer.
3. Finish the private release-publishing proof against the current code.
4. Validate and design the approved native WSPR boundary.
5. Implement and internally validate sidecar-free native WSPR on macOS while
   preserving mobile portability.
6. Run the signed external beta against that native workflow.
7. Publish and promote the first native-WSPR macOS preview.
8. Deliver an App Store-ready iOS product, preserving Android as a supported
   architecture and later validation target.

Summary redesign, newcomer-facing website work, and organization/hardware
foundation work may proceed alongside the critical path when their dependencies
allow.

## Existing-Issue Reconciliation

### #33 — trustworthy desktop releases and release assets

Keep open.

- Clarify that the immediate outcome is a trustworthy private publishing proof
  against the current code.
- State that public promotion and external beta distribution wait for native
  WSPR.
- Add the organization transfer as a prerequisite for final repository and
  release-environment setup.
- Preserve the existing signing, notarization, verification, and supply-chain
  requirements.

### #36 — complete owner setup and prove a signed desktop release

Keep open with `in-progress` and `human-required`.

- State that the candidate uses the then-current reviewed `main`.
- State that the candidate remains a private draft.
- State that completing this issue neither starts #79 nor authorizes public
  promotion.
- Add the organization transfer and post-transfer settings audit before final
  credentialed setup.

### #60 — enable repository supply-chain protections

Keep open with `human-required`.

- Make the organization transfer a dependency.
- Replace the pre-transfer live-settings audit with a fresh post-transfer audit.
- Prefer organization-wide security defaults where they safely establish a
  floor, while retaining repository-specific release protections.
- Preserve least privilege and the protected `desktop-release` environment.

### #75 — validate with real operators and field sessions

Refresh the body rather than replacing it with another tracker.

- Mark #229, #230, and #232 complete.
- Record #94's implementation as complete and retain the real native-prompt
  smoke in the appropriate maintainer session.
- Acknowledge that the landed Summary-first redesign received new formative
  findings and needs a focused follow-up.
- Sequence the current-code maintainer alpha before native WSPR as useful
  internal evidence.
- Sequence #79 only after the release proof and native WSPR.
- Remove the blanket statement that built-in WSPR transmit audio is out of
  scope; native transmit audio is planned, while CAT/PTT remains deferred.
- Preserve privacy, no-telemetry, and product-evidence boundaries.

Add one sanitized comment summarizing the first newcomer session:

- the site looked polished but lacked an obvious action and concrete product
  demonstration;
- the lack of a signed download was immediately visible;
- real application screenshots and a step-by-step workflow were requested;
- coordinating AntennaBench and WSJT-X created substantial mental overhead;
- the demonstrated application flow was broadly coherent once explained;
- the Summary buried the primary dB result among jargon-heavy equal-weight
  cards and excessive chrome;
- the participant was interested in an organization and an open hardware
  antenna switch; and
- every material finding was triaged into the issue graph defined here.

The comment must say that this was formative product feedback, not formal #77
completion or scientific validation. It must contain no identifying or station
information.

### #77 — evaluate report comprehension

Keep open with `human-required`, but simplify substantially.

- Remove fixed hashes, obsolete pre-Summary terminology, and the separate
  artifact-pinning dependency.
- Remove the requirement that a fixed cohort complete an identical exhaustive
  protocol.
- For each session, record the revision or URL reviewed, relevant aggregate
  experience, glance-level interpretation, key misunderstandings, useful
  elements, and dispositions.
- Preserve privacy and false-conclusion safety.
- Encourage, rather than require, a mix of WSPR-experienced and newcomer
  perspectives.
- Treat follow-up checks as proportionate to the materiality of each change.
- Link the new at-a-glance Summary issue and #75.

### #78 — maintainer manual/no-rig field alpha

Keep open.

- Clarify that it evaluates the currently workable WSJT-X companion workflow
  internally.
- Clarify that it neither starts the external beta nor authorizes promotion.
- Preserve its mistake, recovery, evidence, report, export, and privacy matrix.

### #79 — signed external operator field beta

Rewrite around the native WSPR workflow.

Entry requires:

- #36's signed publishing proof;
- native WSPR receive/decode and RF-ready transmit audio;
- material Summary findings dispositioned;
- maintainer native-workflow blockers fixed or accepted; and
- native installation, audio, recovery, and feedback guidance.

Replace WSJT-X-specific tasks with:

- audio permission and device setup;
- native decoder readiness and local evidence;
- transmit-audio generation and explicit arming;
- manual tuning and VOX operation;
- online and offline sessions;
- device disappearance, interruption, recovery, and resume;
- report interpretation and both export paths; and
- installation without a development checkout.

Keep public launch, CAT/PTT automation, telemetry, hosted publishing, and
statistical antenna validation out of scope.

### #159 — QK4 switching while WSJT-X holds CAT

Keep open as deferred fallback compatibility work.

- Remove the stale `in-progress` label.
- Retain the recorded root cause and safety boundary.
- State that it no longer blocks public promotion once native WSPR removes the
  primary CAT-client conflict.
- Preserve explicit failure for unverified switching.

### #233 — native WSPR without WSJT-X

Refocus the issue from deciding whether to pursue native WSPR to validating and
designing the approved first slice.

- Retain exact-version modem, decoder-quality, licensing, supply-chain, audio,
  evidence, and RF-safety investigation.
- Set the product target to native RX/decode plus RF-ready TX audio with manual
  tuning and VOX.
- Treat CAT, PTT, complete station control, and WSPRnet upload as later,
  separately approved work.
- Require the audio/modem boundary to be portable across macOS, iOS, and
  Android.
- Measure macOS first without embedding macOS-only assumptions in domain or
  evidence interfaces.
- Preserve WSJT-X UDP and import compatibility.
- Verify the current `mfsk-core` release and upstream gaps at execution time.
- Produce focused implementation issues only after the architecture,
  distribution license, and RF-ready waveform boundary are resolved.

The current upstream assessment remains:

- `mfsk-core` 0.7.4 is the latest published release;
- it remains GPL-3.0-or-later;
- its successful WSPR result does not expose the SNR/drift values AntennaBench
  currently analyzes; and
- its WSPR synthesizer explicitly describes itself as a decoder-test first pass,
  not an over-the-air-ready transmitter.

### #266 — make report reading Summary-first

Keep open.

- Retain the completed Summary-first children.
- Add the new at-a-glance Summary issue as a child.
- Remove #274 and the artifact-pin exit criterion.
- Make lightweight #77 feedback the remaining comprehension boundary.
- Retain Full evidence, deterministic rendering, coherent revision, and
  no-winner invariants.

### #274 — repin report-comprehension artifacts

- Remove `agent-ready`.
- Close as not planned.
- Explain that per-session revision/URL recording in #77 provides proportionate
  reproducibility without a separate hash-and-repin workflow.

### #26 — comparative conclusions

Keep deferred.

- Preserve the no-universal-winner and descriptive-evidence boundaries.
- Reword its evidence gate to reference the simplified #77 and native-workflow
  #79.

### #10 — optional hosted sharing

Leave substantively unchanged. Its post-#79 reassessment gate remains valid.

### #285 — outbound HTTP identity

The implementation is on `main`. Verify its required completion evidence,
comment with the landed result and verification, and close it as completed.

## New Issues

### Establish the AntennaBench organization and transfer the project

Suggested title:

> Owner action: establish the AntennaBench organization and transfer the project

Labels and milestone:

- `enhancement`
- `human-required`
- `Trustworthy macOS Release`

Outcome:

- create the `antennabench` GitHub organization;
- transfer `rwjblue/antennabench`;
- add the collaborator with the intended least-privilege role;
- preserve and verify issues, pull requests, releases, tags, redirects, website
  integration, Actions, installed apps, environments, secrets, and custom-domain
  behavior;
- update canonical repository URLs, badges, documentation, release metadata,
  and local remotes;
- create the hardware-design repository; and
- trigger fresh #60 and #36 audits after transfer.

Shared organization foundation:

- create a public `antennabench/.github` repository;
- add an organization profile README linking the application, hardware,
  website, roadmap, and status;
- migrate generic planned-implementation, agent-ready, technical-decision,
  owner-decision, tracking, and human-validation templates;
- add a shared pull-request template;
- add default `SECURITY.md`, `SUPPORT.md`, and a concise organization-level
  `CONTRIBUTING.md`;
- create `maintainers` and `hardware` teams;
- use repository-local `CODEOWNERS` files referencing those teams;
- set organization Actions defaults to read-only tokens, no Action-created PR
  approvals, a reviewed-action allowlist, full-SHA action pinning, and an
  external-contributor approval policy; and
- use organization-wide rulesets only if the selected GitHub plan exposes the
  required behavior, otherwise retain repository rulesets.

Keep repository-specific:

- licenses;
- `dependabot.yml`;
- application release/deployment and hardware build workflows;
- Apple, Cloudflare, and future hardware credentials;
- detailed contributor setup;
- repository-specific verification commands; and
- `CODEOWNERS`.

Do not centralize reusable CI workflows until two repositories demonstrate a
stable duplicated need.

### Make the Summary communicate the primary result at a glance

Labels and milestone:

- `enhancement`
- `agent-ready`
- `Field Validation`

Tracked by #266 and evaluated through #77.

Outcome:

- make the primary session-scoped dB result the dominant above-the-fold visual;
- replace three equal-weight jargon cards with one primary answer graphic and
  subordinate evidence availability/status;
- explain shared-path signal and evidence populations in ordinary language;
- put technical definitions and repeated explanation behind accessible help or
  disclosure controls;
- reduce in-app Session Summary chrome and collapse run details while preserving
  export context;
- retain the principal limitation beside the result;
- preserve Summary/Full evidence coherence, deterministic rendering,
  accessibility, print behavior, and no-winner semantics; and
- verify glance comprehension through lightweight #77 feedback.

### Show newcomers the actual AntennaBench application and workflow

Labels:

- `enhancement`
- `agent-ready`

Outcome:

- show real desktop application screenshots for setup, Active Run, switching,
  and Summary reading;
- add concise captions and accessible alternative text;
- explain what the operator does and what the application produces;
- replace marketing-heavy ambiguity with a concrete step-by-step path;
- retain an honest source-only CTA until a public artifact exists; and
- make screenshot capture and replacement repeatable for the later native WSPR
  workflow.

### Define the first App Store-ready mobile AntennaBench product

Labels:

- `decision`

Depends on #233's cross-platform architecture.

Outcome:

- make iOS the first tested mobile target while preserving Android;
- define audio input/output and permission behavior;
- define WSPR receive/decode and transmit-audio behavior;
- define suspend, interruption, background, timing, and recovery boundaries;
- define local storage, bundle import/export, and offline operation;
- define optional WSPR.live use without making the network authoritative;
- retain manual tuning and VOX as the initial radio boundary;
- identify App Store and Play review/distribution constraints; and
- produce a device-testing and phased implementation plan.

### Record and publish a first-comparison walkthrough

Labels:

- `enhancement`
- `human-required`

Depends on stable native WSPR and Summary workflows.

Outcome:

- record installation and first launch;
- show radio/audio setup;
- conduct a representative comparison;
- explain the Summary's primary result and limitation;
- show when Full evidence is useful;
- publish through the owner's YouTube channel; and
- link or embed the walkthrough from the project site.

### Publish and promote the first native-WSPR macOS preview

Labels:

- `enhancement`
- `human-required`

Depends on:

- #36;
- native WSPR implementation and internal validation;
- the at-a-glance Summary issue;
- #79; and
- candidate-ready installation and support documentation.

Outcome:

- publish the reviewed signed, notarized, stapled native-WSPR assets;
- independently verify the public download;
- make download the website's primary call to action;
- publish release notes, installation, verification, limitations, rollback, and
  troubleshooting guidance; and
- perform a final download/install/launch/native-run/report/export smoke.

Auto-update, package-manager distribution, Windows/Linux public artifacts, and
mobile release remain separate work.

## Hardware Repository Boundary

The current application repository does not own PCB, KiCad, enclosure,
firmware, BOM, or electrical-safety implementation issues.

After the organization creates the hardware repository, create and refine that
backlog there. Early hardware work should cover:

- experiment goals and safe power envelope;
- RF switching topology and failure behavior;
- KiCad schematic and PCB iterations;
- enclosure and assembly;
- firmware and BLE transport;
- an open-hardware licensing decision;
- bench and RF validation; and
- a stable app-facing control protocol.

Only the app-facing BLE protocol and integration work should be linked back to
the application repository.

## Maintained Documentation

After issue numbers exist:

- update `docs/roadmap.md` with the approved sequence and review date;
- update `docs/work-tracking.md` with the reconciled milestones and focused
  issues;
- update maintained product and architecture references so native WSPR is an
  approved planned direction rather than a vague later possibility;
- keep current-availability text explicit that native WSPR and public signed
  downloads do not exist yet; and
- update hard-coded `rwjblue/antennabench` repository references only after the
  transfer, preserving historical links where changing them would misrepresent
  history.

## GitHub Mutation Order

1. Create the organization-transfer issue.
2. Create the Summary, website, mobile, video, and public-preview issues.
3. Patch #33, #36, #60, #75, #77, #78, #79, #159, #233, #266, and #26 using
   the new issue numbers.
4. Confirm #10 remains coherent.
5. Close #274 as not planned.
6. Add the sanitized feedback comment to #75.
7. Verify and close #285 with completion evidence.
8. Update maintained roadmap and reference documents.
9. Re-read every remaining open issue touched by this work and correct
   contradictory dependencies, stale checkboxes, labels, or milestone state.

## Validation

Before reporting the issue graph complete:

- fetch the final open-issue list;
- verify every new issue has the intended labels and milestone;
- verify every parent checklist uses actual issue numbers;
- verify #274 is closed as not planned and no active issue still depends on it;
- verify #77 contains no obsolete fixed-artifact or pre-Summary contract;
- verify #75 contains no stale open blocker checkboxes;
- verify #79 describes native WSPR rather than WSJT-X setup;
- verify #233 clearly distinguishes the approved product slice from unresolved
  technical and licensing choices;
- verify no issue claims native WSPR, mobile, a hardware repository, or a public
  download already exists;
- verify maintained documentation agrees with the final issue graph; and
- verify the local working copy contains only the approved documentation
  changes.

## Non-Goals

This roadmap reconciliation does not:

- create or transfer the GitHub organization itself;
- expose, create, or move credentials;
- publish a release;
- implement native WSPR;
- implement a mobile application;
- design or manufacture hardware;
- redesign the website or Summary;
- record or upload a video;
- add CAT/PTT or WSPRnet upload;
- select a universal antenna winner; or
- reopen the retired hosted-sharing implementation.
