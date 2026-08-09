"use strict";

const assert = require("node:assert/strict");
const match = require("../frontend/opportunity-match");
const {
  ASSESSMENT_VERSION,
  FUNDING_DISCLAIMER,
  fallbackAssessmentData,
  normalizeAssessmentData,
  validateAssessmentData,
} = require("../src/lib/assessment-normalize");
const {
  fallbackProjectData,
  normalizeProjectData,
  validateProjectData,
} = require("../src/lib/normalize");

assert.equal(match.MATCH_VERSION, "rafid.opportunity-match.v1");
assert.equal(match.validateInputs({ opportunityText: "قصير", researchText: "قصير" }).valid, false);
assert.equal(
  match.validateInputs({ opportunityText: "ف".repeat(120), researchText: "ب".repeat(40) }).valid,
  true,
);

const privacy = {
  classification: "internal",
  remote_processing_confirmed: true,
  redaction_preview_confirmed: true,
  redactions_applied: [],
};
const opportunityRequest = match.buildOpportunityRequest({
  opportunityText: "شروط فرصة".repeat(20),
  opportunityTitle: "فرصة الاختبار",
  funder: "جهة ممولة",
  officialUrl: "https://example.org/opportunity",
  deadline: "2026-12-31",
  opportunitySourceName: "guide.pdf",
  privacy,
});
assert.equal(opportunityRequest.metadata.title, "فرصة الاختبار");
assert.equal(opportunityRequest.metadata.official_source_url, "https://example.org/opportunity");
assert.equal(opportunityRequest.privacy, privacy);

const projectRequest = match.buildProjectRequest({
  researchText: "محتوى البحث".repeat(10),
  projectTitle: "مشروع تجريبي",
  projectFiles: [{ name: "research.pdf", type: "application/pdf", size: 42 }],
  privacy,
});
assert.equal(projectRequest.metadata.owner, null);
assert.equal(projectRequest.files.length, 1);
assert.equal(projectRequest.files[0].name, "research.pdf");

const opportunity = {
  identity: { opportunity_id: "opp-1", title: "فرصة الاختبار", funder: "جهة", deadline: null },
  requirements: [
    {
      requirement_id: "req-1",
      requirement_type: "إلزامي",
      gate_type: "بوابة صارمة",
      title: "وجود جهة مؤهلة",
      description: "وجود جهة مؤهلة",
      evidence_required: ["خطاب الجهة"],
      source_quote: "يجب وجود جهة مؤهلة",
    },
  ],
  submission_documents: [
    { document_id: "doc-1", name: "الملخص التنفيذي", mandatory: true, description: "ملخص المشروع" },
  ],
};
const project = {
  project_identity: { project_title: "مشروع تجريبي", project_owner: { name: null }, university: null },
  project_stage: { current_stage: "فكرة" },
};
const assessment = normalizeAssessmentData(
  {
    hard_gates: [],
    fit_dimensions: [],
    readiness: { opportunity_readiness_score: 62, evidence_strength_score: 41, assessment_confidence: 70, summary: "ملاءمة مشروطة" },
    gaps: [],
    action_plan: [],
    application_package: [],
    institutional_review: { recommendation: "تحتاج قرارًا مؤسسيًا", rationale: "يلزم دليل", questions_for_project_team: [], questions_for_funder: [], reviewer_attention_points: [], institutional_review_required: true },
    risk_disclosures: [],
  },
  { opportunity, project },
);
assert.equal(assessment.analysis_version, ASSESSMENT_VERSION);
assert.equal(assessment.funding_disclaimer, FUNDING_DISCLAIMER);
assert.equal(assessment.hard_gates.length, 1);
assert.equal(assessment.eligibility.status, "غير محسوم");
assert.equal(validateAssessmentData(assessment).valid, true);
assert.equal(match.validateAssessment(assessment).valid, true);
assert.deepEqual(match.gateSummary(assessment.hard_gates), { total: 1, met: 0, partial: 0, missing: 0, unknown: 1 });
assert.match(match.summaryText(assessment), /غير محسوم/);
assert.match(match.summaryText(assessment), /62 من 100/);
assert.equal(match.decisionTone("غير مؤهل"), "ineligible");

const compactAssessment = normalizeAssessmentData(
  {
    hard_gates: [
      {
        requirement_id: "req-1",
        status: "غير معروف",
        verdict_basis: "لا يتوفر خطاب جهة في بيانات المشروع.",
        project_evidence: ["ذُكرت جهة أكاديمية دون خطاب."],
        missing_evidence: ["خطاب الجهة"],
        remediation: "إرفاق خطاب رسمي.",
      },
    ],
    fit_dimensions: [],
    readiness: { opportunity_readiness_score: 40, evidence_strength_score: 30, assessment_confidence: 55, summary: "تحتاج أدلة." },
    institutional_review: { recommendation: "تحتاج قرارًا مؤسسيًا", rationale: "الأهلية غير محسومة.", questions_for_project_team: [], questions_for_funder: [], reviewer_attention_points: [], institutional_review_required: true },
    risk_disclosures: [],
  },
  { opportunity, project },
);
assert.equal(compactAssessment.hard_gates[0].resolution, "يحتاج تحقق");
assert.equal(compactAssessment.hard_gates[0].project_evidence[0].strength, "جزئي");
assert.ok(compactAssessment.gaps.length >= 1);
assert.ok(compactAssessment.action_plan.length >= 1);
assert.equal(compactAssessment.application_package.length, 1);
assert.equal(validateAssessmentData(compactAssessment).valid, true);

const incompleteResearch = normalizeProjectData({
  project_identity: { project_title: "بحث ناقص", project_owner: { name: null }, project_type: [] },
  project_stage: { current_stage: "غير محدد" },
  problem: { problem_statement: null },
  solution: { solution_summary: null },
  prototype_and_data: { prototype_exists: false, attachments_or_links: [] },
  claims_and_evidence: [],
  risks: [],
  contradictions: [],
  assumptions_explicitly_stated_in_source: [],
  source_summary: { sources_reviewed: [], information_completeness: "منخفضة", extraction_confidence: 30, notes: "" },
});
const incompleteValidation = validateProjectData(incompleteResearch);
assert.equal(incompleteValidation.valid, true);
assert.ok(incompleteValidation.warnings.some((warning) => /غير موضحة/.test(warning)));

const fallbackProject = fallbackProjectData("نص بحث تجريبي يصف المشكلة والمنهجية دون بنية منظمة.", {
  metadata: { title: "بحث احتياطي", type: "بحث" },
  files: [],
});
assert.equal(validateProjectData(fallbackProject).valid, true);
assert.equal(fallbackProject.project_identity.project_title, "بحث احتياطي");
assert.match(fallbackProject.source_summary.notes, /نص بحث تجريبي/);
assert.equal(fallbackProject.source_summary.extraction_confidence, 25);

const fallbackAssessment = normalizeAssessmentData(
  fallbackAssessmentData({ opportunity, project: fallbackProject }),
  { opportunity, project: fallbackProject },
);
assert.equal(validateAssessmentData(fallbackAssessment).valid, true);
assert.equal(match.validateAssessment(fallbackAssessment).valid, true);
assert.equal(fallbackAssessment.eligibility.status, "غير محسوم");
assert.equal(fallbackAssessment.readiness.assessment_confidence, 35);
assert.equal(fallbackAssessment.fit_dimensions.length, 9);
assert.equal(
  fallbackAssessment.fit_dimensions.reduce((sum, dimension) => sum + dimension.weight_percent, 0),
  100,
);
assert.ok(fallbackAssessment.gaps.length >= 1);
assert.match(fallbackAssessment.readiness.summary, /قراءة محافظة/);

const invalid = structuredClone(assessment);
invalid.readiness.assessment_confidence = 120;
assert.equal(match.validateAssessment(invalid).valid, false);

console.log("Rafid opportunity matching UI contract tests passed.");
