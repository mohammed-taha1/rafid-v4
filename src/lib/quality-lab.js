"use strict";

const crypto = require("node:crypto");

const DEFAULT_THRESHOLDS = Object.freeze({
  eligibility_accuracy: 0.95,
  evidence_citation_accuracy: 0.9,
  hallucination_safety: 1,
  missing_information_recall: 0.9,
  repeat_stability: 1,
  human_reference_agreement: 0.85,
  action_plan_utility: 0.85,
  contradiction_recall: 0.9,
});

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function contains(haystack, needle) {
  return normalizedText(haystack).includes(normalizedText(needle));
}

function stableFingerprint(assessment) {
  const stable = {
    eligibility: assessment?.eligibility,
    gates: arr(assessment?.hard_gates).map((gate) => ({ id: gate.requirement_id, status: gate.status, confidence: gate.confidence })),
    dimensions: arr(assessment?.fit_dimensions).map((item) => ({ name: item.dimension, score: item.score, confidence: item.confidence })),
    readiness: assessment?.readiness,
    gaps: arr(assessment?.gaps).map((item) => ({ id: item.gap_id, severity: item.severity, action: item.required_action })),
    evidence: arr(assessment?.quality_review?.evidence_ledger).map((item) => ({ id: item.evidence_id, locator: item.locator })),
    contradictions: arr(assessment?.quality_review?.contradictions),
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function keywordRecall(expected, text) {
  if (!expected.length) return 1;
  return expected.filter((keyword) => contains(text, keyword)).length / expected.length;
}

function evaluateQualityCase(testCase, assessments) {
  const runs = arr(assessments);
  if (!runs.length) throw new Error(`Quality case ${testCase.id} returned no assessment.`);
  const assessment = runs[0];
  const serialized = JSON.stringify(assessment);
  const evidenceText = JSON.stringify(assessment?.quality_review?.evidence_ledger || []);
  const missingText = JSON.stringify({ gaps: assessment?.gaps, gates: assessment?.hard_gates });
  const actions = arr(assessment?.action_plan);
  const actionText = JSON.stringify(actions);
  const contradictions = arr(assessment?.quality_review?.contradictions);
  const forbidden = arr(testCase.gold.forbidden_claims);
  const forbiddenFound = forbidden.filter((claim) => contains(serialized, claim)).length;
  const score = assessment?.readiness?.opportunity_readiness_score;
  const scoreBand = testCase.gold.score_band;
  const scoreAgreement = testCase.gold.score_unavailable
    ? assessment?.readiness?.score_available === false && (score === null || score === undefined)
    : Number.isFinite(Number(score)) && Number(score) >= scoreBand[0] && Number(score) <= scoreBand[1];
  const actionable = actions.length
    ? actions.filter((item) => item.action && item.why_now && item.output && arr(item.related_gap_ids).length).length / actions.length
    : testCase.gold.action_keywords.length ? 0 : 1;
  const actionKeywordCoverage = keywordRecall(testCase.gold.action_keywords, actionText);
  const fingerprints = new Set(runs.map(stableFingerprint));

  return {
    id: testCase.id,
    cohort: testCase.cohort,
    metrics: {
      eligibility_accuracy: assessment?.eligibility?.status === testCase.gold.eligibility ? 1 : 0,
      evidence_citation_accuracy: keywordRecall(testCase.gold.evidence_locators, evidenceText),
      hallucination_safety: forbidden.length ? 1 - forbiddenFound / forbidden.length : 1,
      missing_information_recall: keywordRecall(testCase.gold.missing_keywords, missingText),
      repeat_stability: fingerprints.size === 1 ? 1 : 0,
      human_reference_agreement: scoreAgreement ? 1 : 0,
      action_plan_utility: Math.min(actionable, actionKeywordCoverage),
      contradiction_recall: contradictions.length >= testCase.gold.minimum_contradictions ? 1 : 0,
    },
  };
}

function aggregateMetrics(results) {
  const names = Object.keys(DEFAULT_THRESHOLDS);
  return Object.fromEntries(names.map((name) => [
    name,
    Number((results.reduce((sum, result) => sum + result.metrics[name], 0) / Math.max(1, results.length)).toFixed(4)),
  ]));
}

function releaseDecision(metrics, thresholds = DEFAULT_THRESHOLDS) {
  const failures = Object.entries(thresholds)
    .filter(([name, threshold]) => Number(metrics[name] || 0) < threshold)
    .map(([name, threshold]) => ({ metric: name, actual: metrics[name], required: threshold }));
  return { passed: failures.length === 0, failures };
}

function regressionDecision(metrics, baseline) {
  const regressions = Object.entries(baseline || {})
    .filter(([name, value]) => Object.hasOwn(metrics, name) && metrics[name] < value)
    .map(([name, value]) => ({ metric: name, actual: metrics[name], baseline: value }));
  return { passed: regressions.length === 0, regressions };
}

function runQualityLab(cases, engine, { repeats = 3, thresholds = DEFAULT_THRESHOLDS } = {}) {
  if (!Array.isArray(cases) || cases.length < 40 || cases.length > 60) {
    throw new Error("Rafid quality lab requires 40–60 benchmark cases.");
  }
  const results = cases.map((testCase) => {
    const assessments = Array.from({ length: repeats }, () => engine(testCase));
    return evaluateQualityCase(testCase, assessments);
  });
  const metrics = aggregateMetrics(results);
  return {
    benchmark_version: "rafid.quality-lab.v1",
    case_count: cases.length,
    repeat_count: repeats,
    metrics,
    release_gate: releaseDecision(metrics, thresholds),
    cohorts: [...new Set(cases.map((item) => item.cohort))],
    results,
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  aggregateMetrics,
  evaluateQualityCase,
  releaseDecision,
  regressionDecision,
  runQualityLab,
  stableFingerprint,
};
