# Read An AntennaBench Summary In Two Minutes

Use the **Summary** for an ordinary first read or share. Open the
[successful canonical Summary](https://antennabench.com/sample-report/summary/)
beside this guide. It comes from a real, sanitized WSPR comparison; your own
Summary follows the same order.

## 1. Start With The Answer

At the top, find **What did this run show?** The large result is the primary
session-scoped signal difference. In the sample it reads `+5 dB`, followed by
an ordinary-language sentence naming which antenna had the higher median
received signal. The value uses only remote paths heard with both antennas in
matched alternating cycles. Its **Available** or **Unavailable** status is part
of the answer; an unavailable result is not `0 dB`.

This is a description of one recorded run. It is not a winner, antenna-gain
measurement, confidence statement, or promise that the result will repeat.

## 2. Keep The Population And Support Attached

The support line directly below the primary answer says how much recorded
evidence contributed. The sample's same-path result uses 83 unique shared
paths, 327 matched observations, and 7 alternating blocks. Each remote path
contributes one median, so a path with many reports does not automatically
outweigh a path with fewer reports.

Do not compare two numbers until their populations match. A large count from a
different band, direction, source, or evidence question does not strengthen
the displayed shared-path result.

## 3. Read The Three Evidence Questions Separately

- The large **same-path signal** result compares signal only where both
  antennas have usable reports for the same remote path in a matched
  alternating block.
- **Detection with the same active receivers** asks what happened among remote
  receivers known to be active during both cycles. The sample marks this
  unavailable because it has no suitable activity record.
- **All observed remote paths** counts unique paths that appeared for either
  antenna. These uncontrolled observed paths show collected reach, not a
  controlled detection rate or a map of everywhere an antenna can reach.

The last two results are visually subordinate because they answer different
questions; they do not vote on or modify the dB result. Open **What these
results compare** for the precise population definitions. Never turn an
unmatched or missing public report into a zero-strength signal. A non-detection
can enter the active-receiver question only when retained evidence establishes
that the receiver was listening in both cycles.

## 4. Read The Principal Limitation

The answer graphic places the **Most important limitation** directly beside the
primary result. Treat it as part of the answer. Then open the short methods or
exact-condition disclosure only if you need to confirm scope. The
[inconclusive example](https://antennabench.com/sample-report/inconclusive/)
shows a valid run with observed paths but no same-path signal comparison.
Unavailable is an evidence outcome, not an application failure.

## 5. Know When To Go Deeper

In Local report and the separate report window, **Run details** starts
collapsed so repeated session chrome does not push the answer down. Open it
with a mouse, touch, Enter, or Space. Standalone Summary exports keep those run
details expanded, and print output retains both the document identity and run
context.

Switch to **Full evidence** when you need exact path medians, block and order
support, activity coverage, distance and direction context, exclusions,
duplicates, conflicts, acquisition gaps, planned-versus-actual history,
provenance, or the audit appendix. Use the
[Full evidence and methodology reference](reading-your-report.md) for that
walkthrough.

Summary and Full evidence are two human-readable views of one committed
snapshot. Neither replaces the [session bundle](bundle-format.md), which is the
lossless durable experiment record and the right artifact to preserve when
someone may need to regenerate or independently inspect the complete evidence.
