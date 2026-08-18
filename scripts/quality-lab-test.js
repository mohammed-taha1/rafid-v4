"use strict";

const assert = require("node:assert/strict");
const { QUALITY_FIXTURES } = require("../benchmarks/quality-fixtures");
const baseline = require("../benchmarks/quality-baseline.json");
const { normalizeAssessmentData, validateAssessmentData } = require("../src/lib/assessment-normalize");
const { compareAssessmentRounds } = require("../src/lib/assessment-quality");
const { regressionDecision, runQualityLab } = require("../src/lib/quality-lab");

function engine(testCase) {
  const assessment = normalizeAssessmentData(testCase.input.model_assessment, testCase.input);
  const validation = validateAssessmentData(assessment);
  assert.equal(validation.valid, true, `${testCase.id}: ${validation.errors.join(" ")}`);
  return assessment;
}

const report = runQualityLab(QUALITY_FIXTURES, engine, { repeats: 3 });
assert.equal(report.case_count, 48);
assert.equal(report.cohorts.length >= 7, true);
assert.equal(report.release_gate.passed, true, JSON.stringify(report.release_gate.failures));
const regression = regressionDecision(report.metrics, baseline.metrics);
assert.equal(regression.passed, true, JSON.stringify(regression.regressions));
assert.equal(report.results.every((result) => result.metrics.repeat_stability === 1), true);
for (const testCase of QUALITY_FIXTURES) {
  const assessment = engine(testCase);
  if (testCase.gold.score_unavailable) {
    assert.equal(assessment.readiness.score_available, false, testCase.id);
    assert.equal(assessment.readiness.opportunity_readiness_score, null, testCase.id);
  }
  assert.equal(
    assessment.quality_review.evidence_ledger.every((item) => item.evidence_id && item.locator?.label),
    true,
    `${testCase.id}: every evidence item needs an id and locator`,
  );
}

const previous = engine(QUALITY_FIXTURES.find((item) => item.cohort === "missing"));
const current = structuredClone(previous);
current.readiness.score_available = true;
current.readiness.opportunity_readiness_score = 72;
current.readiness.evidence_strength_score += 10;
current.eligibility.status = "مؤهل بشروط";
current.gaps = current.gaps.slice(1);
const comparison = compareAssessmentRounds(previous, current);
assert.equal(comparison.current_eligibility, "مؤهل بشروط");
assert.equal(comparison.comparable_score, false);
assert.equal(comparison.closed_gap_count >= 1, true);
assert.equal(comparison.evidence_change, 10);

console.log(JSON.stringify({
  benchmark_version: report.benchmark_version,
  cases: report.case_count,
  repeats: report.repeat_count,
  metrics: report.metrics,
  release_gate: report.release_gate.passed ? "PASS" : "FAIL",
  regression_gate: regression.passed ? "PASS" : "FAIL",
}, null, 2));
