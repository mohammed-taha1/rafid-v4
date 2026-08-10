"use strict";

const crypto = require("node:crypto");
const { normalizeProjectData, validateProjectData, arr } = require("./normalize");
const { normalizeOpportunityData, validateOpportunityData } = require("./opportunity-normalize");
const {
  fallbackAssessmentData,
  normalizeAssessmentData,
  validateAssessmentData,
  portfolioSort,
  STATUS_RANK,
} = require("./assessment-normalize");

const PORTFOLIO_VERSION = "rafid.institutional-portfolio.v1";
const MAX_PORTFOLIO_PROJECTS = 10;

function stableProjectId(project, index) {
  const title = project?.project_identity?.project_title || `project-${index + 1}`;
  return `prj-${crypto.createHash("sha256").update(`${index}:${title}`).digest("hex").slice(0, 12)}`;
}

function priorityBand(assessment) {
  const eligibility = assessment.eligibility.status;
  const score = assessment.readiness.opportunity_readiness_score;
  if (eligibility === "غير مؤهل") return "استبعاد من هذه الدورة";
  if (eligibility === "غير محسوم") return "تحقق أهلية عاجل";
  if (eligibility === "مؤهل بشروط") return score >= 60 ? "أغلق الفجوات ثم قدم" : "تحسين قبل التقديم";
  return score >= 70 ? "أولوية مراجعة عالية" : "مراجعة وتدعيم الأدلة";
}

function compactAssessment(project, assessment, index) {
  const criticalGaps = arr(assessment.gaps).filter((gap) => gap.severity === "مانع" || gap.severity === "حرج");
  const unknownGates = arr(assessment.hard_gates).filter((gate) => gate.status === "غير معروف");
  const failedGates = arr(assessment.hard_gates).filter((gate) => gate.status === "غير مستوفى");
  const topAction = arr(assessment.action_plan).sort((a, b) => a.priority - b.priority)[0];
  return {
    project_id: stableProjectId(project, index),
    title: project.project_identity.project_title || `المشروع ${index + 1}`,
    assessment,
    decision: {
      eligibility: assessment.eligibility.status,
      readiness_score: assessment.readiness.opportunity_readiness_score,
      evidence_score: assessment.readiness.evidence_strength_score,
      confidence_score: assessment.readiness.assessment_confidence,
      priority_band: priorityBand(assessment),
      failed_gates: failedGates.length,
      unknown_gates: unknownGates.length,
      critical_gaps: criticalGaps.length,
      top_blockers: [...failedGates, ...unknownGates].slice(0, 3).map((gate) => gate.requirement),
      next_action: topAction?.action || "راجع شروط الأهلية واربط كل شرط بدليل صريح.",
      reviewer_required: true,
    },
  };
}

function comparePortfolio(opportunityInput, projectInputs) {
  const opportunity = normalizeOpportunityData(opportunityInput || {});
  const opportunityValidation = validateOpportunityData(opportunity);
  if (!opportunityValidation.valid) {
    const error = new Error(`فرصة التمويل غير صالحة: ${opportunityValidation.errors.join(" ")}`);
    error.statusCode = 422;
    error.code = "RAFID_INVALID_OPPORTUNITY";
    throw error;
  }
  if (!Array.isArray(projectInputs) || projectInputs.length < 2) {
    const error = new Error("أضف مشروعين على الأقل للمقارنة المؤسسية.");
    error.statusCode = 400;
    error.code = "RAFID_PORTFOLIO_TOO_SMALL";
    throw error;
  }
  if (projectInputs.length > MAX_PORTFOLIO_PROJECTS) {
    const error = new Error(`الحد الأقصى للمقارنة الواحدة ${MAX_PORTFOLIO_PROJECTS} مشاريع.`);
    error.statusCode = 413;
    error.code = "RAFID_PORTFOLIO_TOO_LARGE";
    throw error;
  }

  const rows = projectInputs.map((input, index) => {
    const project = normalizeProjectData(input || {});
    const validation = validateProjectData(project);
    if (!validation.valid) {
      const error = new Error(`المشروع ${index + 1} غير صالح: ${validation.errors.join(" ")}`);
      error.statusCode = 422;
      error.code = "RAFID_INVALID_PORTFOLIO_PROJECT";
      throw error;
    }
    const assessment = normalizeAssessmentData(
      fallbackAssessmentData({ opportunity, project }),
      { opportunity, project },
    );
    const assessmentValidation = validateAssessmentData(assessment);
    if (!assessmentValidation.valid) {
      const error = new Error(`تعذر بناء تقييم صالح للمشروع ${index + 1}.`);
      error.statusCode = 422;
      error.code = "RAFID_INVALID_PORTFOLIO_ASSESSMENT";
      throw error;
    }
    return compactAssessment(project, assessment, index);
  });

  rows.sort(portfolioSort).forEach((row, index) => {
    row.rank = index + 1;
  });
  const statusCounts = rows.reduce((counts, row) => {
    const status = row.decision.eligibility;
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const reviewQueue = [...rows].sort((a, b) => {
    const eligibilityDelta = (STATUS_RANK[a.decision.eligibility] ?? 9) - (STATUS_RANK[b.decision.eligibility] ?? 9);
    if (eligibilityDelta !== 0) return eligibilityDelta;
    return b.decision.readiness_score - a.decision.readiness_score;
  });

  return {
    portfolio_version: PORTFOLIO_VERSION,
    generated_at: new Date().toISOString(),
    opportunity: {
      opportunity_id: opportunity.identity.opportunity_id,
      title: opportunity.identity.title,
      funder: opportunity.identity.funder,
      deadline: opportunity.identity.deadline,
      official_source_url: opportunity.identity.official_source_url,
    },
    summary: {
      total_projects: rows.length,
      status_counts: statusCounts,
      top_project_id: reviewQueue[0]?.project_id || null,
      projects_requiring_human_review: rows.length,
      decision_rule: "الأهلية أولًا، ثم درجة الجاهزية، ثم قوة الأدلة. لا تتغلب الدرجة على بوابة فاشلة.",
    },
    ranking: rows,
    review_queue: reviewQueue.map((row) => ({
      project_id: row.project_id,
      title: row.title,
      priority_band: row.decision.priority_band,
      next_action: row.decision.next_action,
    })),
    methodology: {
      deterministic: true,
      assessment_version: rows[0]?.assessment?.analysis_version || null,
      rubric_version: rows[0]?.assessment?.quality_review?.rubric_version || null,
      raw_research_retained: false,
      automatic_rejection: false,
    },
    disclaimer: "هذا ترتيب دعم قرار محافظ، وليس قبولًا أو رفضًا آليًا. يجب أن يراجع مختص الأهلية والأدلة والمصدر الرسمي قبل اعتماد القرار.",
  };
}

module.exports = {
  PORTFOLIO_VERSION,
  MAX_PORTFOLIO_PROJECTS,
  comparePortfolio,
};
