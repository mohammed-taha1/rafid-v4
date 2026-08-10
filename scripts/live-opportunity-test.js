"use strict";

const assert = require("node:assert/strict");
const demo = require("../frontend/demo-data");
const match = require("../frontend/opportunity-match");

const baseUrl = String(process.env.RAFID_LIVE_BASE_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("Set RAFID_LIVE_BASE_URL to an approved Rafid staging URL.");
const parsedBase = new URL(baseUrl);
if (parsedBase.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(parsedBase.hostname)) {
  throw new Error("Live validation requires HTTPS, except for an explicit local host.");
}

const privacy = Object.freeze({
  classification: "internal",
  remote_processing_confirmed: true,
  redaction_preview_confirmed: true,
  redactions_applied: [],
});

async function post(path, body, timeoutMs = 180_000) {
  const response = await fetch(`${baseUrl}/api/rafid/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status} (${payload.code || "unknown"})`);
  return payload;
}

async function main() {
  const startedAt = Date.now();
  const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(30_000) });
  assert.equal(health.status, 200);

  const opportunityStarted = Date.now();
  const opportunity = await post("opportunity/extract", match.buildOpportunityRequest({
    opportunityText: demo.opportunity,
    opportunityTitle: demo.opportunityTitle,
    funder: demo.funder,
    opportunitySourceName: "rafid-training-opportunity.txt",
    privacy,
  }));

  const projectStarted = Date.now();
  const project = await post("extract", match.buildProjectRequest({
    researchText: demo.research,
    projectTitle: demo.projectTitle,
    projectFiles: [],
    privacy,
  }));

  const assessmentStarted = Date.now();
  const assessment = await post("opportunity/assess", match.buildAssessmentRequest({
    opportunity: opportunity.opportunity,
    project: project.project_data,
    privacy,
  }));

  const validation = match.validateAssessment(assessment.assessment);
  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.equal(assessment.assessment.analysis_version, match.MATCH_VERSION);
  assert.equal(assessment.assessment.fit_dimensions.length, 9);
  assert.equal(assessment.assessment.quality_review?.rubric_version, "rafid.deterministic-rubric.v2");
  assert.equal(assessment.assessment.quality_review?.second_review_passed, true);
  assert.equal(assessment.assessment.fit_dimensions.every((item) => item.score_basis === "rubric_deterministic"), true);
  assert.ok(assessment.assessment.hard_gates.length >= 1);
  assert.ok(assessment.assessment.action_plan.length >= 1);

  console.log(JSON.stringify({
    ok: true,
    version: assessment.assessment.analysis_version,
    provider: assessment.assessment_meta?.provider || "not_reported",
    fallback_used: Boolean(assessment.assessment_meta?.fallback_used),
    eligibility: assessment.assessment.eligibility.status,
    dimensions: assessment.assessment.fit_dimensions.length,
    gates: assessment.assessment.hard_gates.length,
    gaps: assessment.assessment.gaps.length,
    actions: assessment.assessment.action_plan.length,
    package_items: assessment.assessment.application_package.length,
    deterministic_score: assessment.assessment.readiness.opportunity_readiness_score,
    evidence_coverage: assessment.assessment.quality_review.evidence_coverage_score,
    second_review_corrections: assessment.assessment.quality_review.corrections_count,
    contradictions: assessment.assessment.quality_review.contradiction_count,
    duration_ms: {
      opportunity: projectStarted - opportunityStarted,
      project: assessmentStarted - projectStarted,
      assessment: Date.now() - assessmentStarted,
      total: Date.now() - startedAt,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(`Live opportunity validation failed: ${error.message}`);
  process.exitCode = 1;
});
