"use strict";

const ANALYSIS_VERSION = "rafid.research-readiness.v1";
const FUNDING_DISCLAIMER = "هذا التحليل إرشادي ولا يضمن قبول البحث أو الحصول على تمويل.";
const STATUS = new Set(["موجود", "جزئي", "غير موضح"]);
const TECHNICAL_RUBRIC = Object.freeze({ problem: 10, objectives: 10, methodology: 15, feasibility: 10, resources: 8, risks: 8, preliminaryEvidence: 10, measurement: 8, application: 10, workPlan: 11 });
const FUNDING_RUBRIC = Object.freeze({ value: 12, impact: 12, beneficiaries: 8, budget: 10, justification: 10, deliveryPlan: 10, measurement: 8, risks: 8, fundingFit: 12, researchToProject: 10 });
const ELEMENTS = Object.freeze(["problem","objectives","questionsOrHypotheses","methodology","currentOrExpectedResults","innovation","beneficiaries","scientificImpact","economicImpact","socialImpact","applicability","risks","resources","timeline","team","budget"]);

function item(status = "غير موضح", summary = "غير موضح", evidence = [], assessmentNote = "لا توجد أدلة كافية.") { return { status, summary, evidence, assessmentNote }; }
function emptyElements() { return Object.fromEntries(ELEMENTS.map((key) => [key, item()])); }
function rubricResult(rubric, elements, map) {
  const dimensions = Object.entries(rubric).map(([id, weight]) => {
    const source = elements[map[id]] || item(); const factor = source.status === "موجود" ? 1 : source.status === "جزئي" ? 0.5 : 0;
    return { id, weight, score: Math.round(weight * factor), explanation: source.assessmentNote || "لا توجد أدلة كافية." };
  });
  return { score: dimensions.reduce((sum, row) => sum + row.score, 0), dimensions };
}
function scoreAnalysis(elements) {
  const technical = rubricResult(TECHNICAL_RUBRIC, elements, { problem:"problem", objectives:"objectives", methodology:"methodology", feasibility:"applicability", resources:"resources", risks:"risks", preliminaryEvidence:"currentOrExpectedResults", measurement:"methodology", application:"applicability", workPlan:"timeline" });
  const funding = rubricResult(FUNDING_RUBRIC, elements, { value:"innovation", impact:"scientificImpact", beneficiaries:"beneficiaries", budget:"budget", justification:"problem", deliveryPlan:"timeline", measurement:"methodology", risks:"risks", fundingFit:"applicability", researchToProject:"currentOrExpectedResults" });
  return { technical, funding };
}
function validateAnalysis(value) {
  const errors = []; const result = value?.result || value;
  if (!result || typeof result !== "object") errors.push("النتيجة غير كائن.");
  for (const key of ["analysisVersion","sourceSummary","researchSummary","extractedElements","technicalReadiness","fundingReadiness","strengths","criticalGaps","importantGaps","additionalImprovements","actionPlan","researcherQuestions","fundingChecklist","confidence","limitations","fundingDisclaimer"]) if (!(key in (result || {}))) errors.push(`حقل مفقود: ${key}`);
  for (const key of ELEMENTS) { const entry = result?.extractedElements?.[key]; if (!entry || !STATUS.has(entry.status) || typeof entry.summary !== "string" || !Array.isArray(entry.evidence) || typeof entry.assessmentNote !== "string") errors.push(`عنصر بحث غير صالح: ${key}`); }
  for (const key of ["technicalReadiness","fundingReadiness"]) { const score = result?.[key]?.score; if (!Number.isInteger(score) || score < 0 || score > 100 || !Array.isArray(result?.[key]?.dimensions) || result[key].dimensions.some((d) => !d.explanation)) errors.push(`تقييم غير صالح: ${key}`); }
  if (result?.fundingDisclaimer !== FUNDING_DISCLAIMER) errors.push("إخلاء المسؤولية الثابت مفقود.");
  return { valid: errors.length === 0, errors };
}
function createAnalysis({ sourceSummary = "", researchSummary = "", elements = emptyElements(), confidence = "منخفض", limitations = [] } = {}) {
  const scores = scoreAnalysis(elements); return { analysisVersion: ANALYSIS_VERSION, sourceSummary, researchSummary, extractedElements: elements, technicalReadiness: scores.technical, fundingReadiness: scores.funding, strengths: [], criticalGaps: [], importantGaps: [], additionalImprovements: [], actionPlan: [], researcherQuestions: [], fundingChecklist: [], confidence, limitations, fundingDisclaimer: FUNDING_DISCLAIMER };
}
module.exports = { ANALYSIS_VERSION, ELEMENTS, FUNDING_DISCLAIMER, TECHNICAL_RUBRIC, FUNDING_RUBRIC, createAnalysis, emptyElements, scoreAnalysis, validateAnalysis };
