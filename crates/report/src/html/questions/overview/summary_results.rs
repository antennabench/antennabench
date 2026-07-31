use super::*;

pub(super) fn summary_primary_result(report: &SessionReport) -> SummaryPrimaryResultView {
    let available = report
        .overview
        .strata
        .iter()
        .filter_map(|row| match row.path_delta {
            ReportOverviewPathDelta::Available {
                median_path_delta_right_minus_left_db,
                ..
            } => Some((row, median_path_delta_right_minus_left_db)),
            ReportOverviewPathDelta::Unavailable => None,
        })
        .collect::<Vec<_>>();
    if let [(row, median)] = available.as_slice() {
        let AntennaLabels {
            left: left_label,
            right: right_label,
        } = antenna_labels(report);
        let explanation = if *median > 0.0 {
            format!(
                "On remote paths heard with both antennas, {right_label}'s median received signal was {} dB higher than {left_label}'s during this recorded run.",
                format_number(median.abs()),
            )
        } else if *median < 0.0 {
            format!(
                "On remote paths heard with both antennas, {left_label}'s median received signal was {} dB higher than {right_label}'s during this recorded run.",
                format_number(median.abs()),
            )
        } else {
            "On remote paths heard with both antennas, the median received-signal difference was 0 dB during this recorded run."
                .to_string()
        };
        return SummaryPrimaryResultView {
            status: "Available",
            status_class: "available",
            value: format!("{} dB", format_signed(*median)),
            explanation,
            support: format!(
                "{} shared path{} · {} matched observation{} · {} alternating block{}",
                row.unique_path_count,
                plural_suffix(row.unique_path_count),
                row.paired_row_count,
                plural_suffix(row.paired_row_count),
                row.contributing_block_count,
                plural_suffix(row.contributing_block_count),
            ),
        };
    }
    if available.len() > 1 {
        return SummaryPrimaryResultView {
            status: "Available",
            status_class: "available",
            value: format!("{} separate dB results", available.len()),
            explanation: format!(
                "{} test conditions have same-path signal results. They remain separate because their direction, band, mode, evidence kind, or source differs.",
                available.len(),
            ),
            support: "Open the exact-condition disclosure for each result and its own support."
                .to_string(),
        };
    }

    let (value, explanation) = match report.overview.comparison_availability {
        antennabench_analysis::ComparisonAvailability::NotApplicable => (
            "No comparison result",
            "This session profiles one antenna. Comparative signal and detection questions do not apply.",
        ),
        antennabench_analysis::ComparisonAvailability::UnsupportedComparisonShape => (
            "No supported dB result",
            "This session shape does not support an A/B signal comparison.",
        ),
        antennabench_analysis::ComparisonAvailability::NoEligibleBlocks => (
            "No matched dB result",
            "No eligible alternating block supports a same-path signal comparison.",
        ),
        antennabench_analysis::ComparisonAvailability::NoMatchedPaths => (
            "No shared-path dB result",
            "The run did not hear the same remote path with both antennas in a matched comparison.",
        ),
        antennabench_analysis::ComparisonAvailability::DescriptivePairsAvailable => (
            "No finite-SNR dB result",
            "Matched evidence was recorded, but no finite signal values support a same-path dB result.",
        ),
    };
    SummaryPrimaryResultView {
        status: "Unavailable",
        status_class: "unavailable",
        value: value.to_string(),
        explanation: zero_evidence_diagnosis(report).unwrap_or_else(|| explanation.to_string()),
        support: "Missing or unmatched evidence is not treated as a 0 dB measurement.".to_string(),
    }
}

pub(super) fn summary_secondary_findings(report: &SessionReport) -> Vec<SummaryFindingView> {
    let answerability = &report.overview.answerability;
    let evidence = |family| {
        report
            .overview
            .strata
            .iter()
            .filter_map(|row| {
                headline_evidence(report, row)
                    .into_iter()
                    .find(|fact| fact.family == family)
            })
            .collect::<Vec<_>>()
    };
    let controlled = evidence(crate::ReportQuestionFamily::CommonOpportunityDetection);
    let observed = evidence(crate::ReportQuestionFamily::ObservedReach);
    let controlled_limited = report
        .reporter_activity
        .joint_summaries
        .iter()
        .any(|summary| {
            matches!(
                summary.coverage,
                antennabench_analysis::ReporterActivityCoverage::Partial
                    | antennabench_analysis::ReporterActivityCoverage::Truncated
            )
        });
    let mut controlled_finding = summary_finding(
        "Detection with the same active receivers",
        if answerability.paired_detectability == PairedDetectabilityAnswerability::Available {
            if controlled_limited {
                "Limited"
            } else {
                "Available"
            }
        } else {
            "Unavailable"
        },
        controlled,
        paired_detectability_answerability_text(answerability.paired_detectability),
        "Uncontrolled path totals are not substituted for this population.",
    );
    if controlled_limited {
        controlled_finding.support = format!(
            "{} Activity coverage was partial or truncated; rates use only retained known opportunities.",
            controlled_finding.support,
        );
    }
    vec![
        controlled_finding,
        summary_finding(
            "All observed remote paths",
            if answerability.observed_reach == ObservedReachAnswerability::Available {
                "Available"
            } else {
                "Unavailable"
            },
            observed,
            match answerability.observed_reach {
                ObservedReachAnswerability::Available => "Available from unique observed paths",
                ObservedReachAnswerability::NoUsablePaths => "No usable observed paths",
            },
            "These descriptive footprint counts are not a controlled coverage comparison.",
        ),
    ]
}

fn summary_finding(
    label: &'static str,
    status: &'static str,
    evidence: Vec<HeadlineEvidence>,
    unavailable_result: &'static str,
    unavailable_support: &'static str,
) -> SummaryFindingView {
    let status_class = match status {
        "Available" => "available",
        "Limited" => "limited",
        _ => "unavailable",
    };
    let (result, support) = match evidence.as_slice() {
        [fact] => (fact.value.clone(), fact.detail.clone()),
        [] => (
            unavailable_result.to_string(),
            unavailable_support.to_string(),
        ),
        facts => (
            format!("Available in {} separate conditions", facts.len()),
            "Exact values remain separated by direction, band, mode, evidence kind, and source."
                .to_string(),
        ),
    };
    SummaryFindingView {
        label,
        status,
        status_class,
        result,
        support,
    }
}
