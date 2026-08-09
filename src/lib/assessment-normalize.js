"use strict";

const { arr, clamp, stableId } = require("./opportunity-normalize");

const ASSESSMENT_VERSION = "rafid.opportunity-match.v1";
const FUNDING_DISCLAIMER =
  "هذا التقييم استرشادي ولا يضمن القبول أو التمويل. المصدر الرسمي وقرار الجهة الممولة هما المرجع النهائي، وقد توجد شروط إضافية للتخصص أو الشريك أو الجاهزية التقنية أو الملكية الفكرية أو التراخيص.";

const STATUS_RANK = {
  "مؤهل": 0,
  "مؤهل بشروط": 1,
  "غير محسوم": 2,
  "غير مؤهل": 3,
};

function projectTitle(project) {
  return project?.project_identity?.project_title || "مشروع غير مسمى";
}

function projectOwner(project) {
  return project?.project_identity?.project_owner?.name || null;
}

function projectOrganization(project) {
  return project?.project_identity?.university || null;
}

function projectStage(project) {
  return project?.project_stage?.current_stage || "غير محدد";
}

function mandatoryHardRequirements(opportunity) {
  return arr(opportunity?.requirements).filter(
    (item) =>
      item?.requirement_type === "إلزامي" && item?.gate_type === "بوابة صارمة",
  );
}

function missingGate(requirement) {
  return {
    requirement_id: requirement.requirement_id,
    requirement: requirement.title || requirement.description || "شرط غير مسمى",
    status: "غير معروف",
    resolution: "يحتاج تحقق",
    verdict_basis: "لم يرجع المحرك حكمًا موثقًا لهذا الشرط؛ أضافه رافد حتميًا للمراجعة.",
    project_evidence: [],
    missing_evidence: arr(requirement.evidence_required).length
      ? arr(requirement.evidence_required)
      : ["دليل يثبت استيفاء الشرط"],
    remediation: "راجع المشروع والمصدر وأرفق الدليل أو اطلب حسمًا من الجهة الممولة.",
    owner_role: "مكتب البحث",
    due_date: null,
    opportunity_source_quote: requirement.source_quote || "",
  };
}

function deriveEligibility(gates) {
  const blockingFailure = gates.some(
    (gate) =>
      gate.status === "غير مستوفى" &&
      gate.resolution === "غير قابل للإصلاح لهذه الدورة",
  );
  if (blockingFailure) {
    return {
      status: "غير مؤهل",
      can_submit_now: false,
      reason: "توجد بوابة أهلية صارمة غير مستوفاة ولا يمكن إصلاحها في هذه الدورة.",
    };
  }

  const unknown = gates.some((gate) => gate.status === "غير معروف");
  if (unknown) {
    return {
      status: "غير محسوم",
      can_submit_now: false,
      reason: "توجد بوابة أهلية صارمة لم يتوفر دليل كافٍ لحسمها.",
    };
  }

  const conditional = gates.some(
    (gate) =>
      gate.status === "مستوفى جزئيًا" ||
      gate.status === "غير مستوفى" ||
      gate.resolution === "قابل للإغلاق" ||
      gate.resolution === "يحتاج تحقق",
  );
  if (conditional) {
    return {
      status: "مؤهل بشروط",
      can_submit_now: false,
      reason: "يمكن أن يصبح المشروع جاهزًا بعد إغلاق شروط أو أدلة محددة.",
    };
  }

  return {
    status: "مؤهل",
    can_submit_now: true,
    reason: "جميع بوابات الأهلية الصارمة مستوفاة وفق الأدلة المتاحة.",
  };
}

function normalizeAssessmentData(assessment, { opportunity, project } = {}) {
  const item = structuredClone(assessment || {});
  item.analysis_version = ASSESSMENT_VERSION;
  item.funding_disclaimer = FUNDING_DISCLAIMER;
  item.project_snapshot = {
    project_title: projectTitle(project),
    project_owner: projectOwner(project),
    organization: projectOrganization(project),
    project_stage: projectStage(project),
  };
  item.opportunity_snapshot = {
    opportunity_id: opportunity?.identity?.opportunity_id || "",
    title: opportunity?.identity?.title || "فرصة غير مسماة",
    funder: opportunity?.identity?.funder || null,
    deadline: opportunity?.identity?.deadline || null,
  };
  item.assessment_id =
    item.assessment_id ||
    stableId(
      "asm",
      item.opportunity_snapshot.opportunity_id,
      item.project_snapshot.project_title,
      item.project_snapshot.project_owner,
    );

  const gatesByRequirement = new Map();
  for (const gate of arr(item.hard_gates)) {
    if (!gate?.requirement_id || gatesByRequirement.has(gate.requirement_id)) continue;
    gatesByRequirement.set(gate.requirement_id, gate);
  }
  item.hard_gates = mandatoryHardRequirements(opportunity).map(
    (requirement) => gatesByRequirement.get(requirement.requirement_id) || missingGate(requirement),
  );

  item.fit_dimensions = arr(item.fit_dimensions).map((dimension) => ({
    ...dimension,
    score: clamp(dimension.score),
    weight_percent: Math.max(0, Math.min(100, Number(dimension.weight_percent) || 0)),
  }));
  item.readiness ||= {};
  item.readiness.opportunity_readiness_score = clamp(
    item.readiness.opportunity_readiness_score,
  );
  item.readiness.evidence_strength_score = clamp(item.readiness.evidence_strength_score);
  item.readiness.assessment_confidence = clamp(item.readiness.assessment_confidence);
  item.readiness.summary = String(item.readiness.summary || "");

  item.gaps = arr(item.gaps).map((gap, index) => ({
    ...gap,
    gap_id:
      gap.gap_id ||
      stableId("gap", item.assessment_id, gap.title, gap.related_requirement_id, index),
  }));
  item.action_plan = arr(item.action_plan)
    .map((action, index) => ({
      ...action,
      action_id: action.action_id || stableId("act", item.assessment_id, action.action, index),
      priority: Math.max(1, Math.round(Number(action.priority) || index + 1)),
      related_gap_ids: arr(action.related_gap_ids),
    }))
    .sort((a, b) => a.priority - b.priority);
  item.application_package = arr(item.application_package);
  item.risk_disclosures = arr(item.risk_disclosures);
  item.institutional_review ||= {};
  item.institutional_review.institutional_review_required = true;
  item.institutional_review.questions_for_project_team = arr(
    item.institutional_review.questions_for_project_team,
  );
  item.institutional_review.questions_for_funder = arr(
    item.institutional_review.questions_for_funder,
  );
  item.institutional_review.reviewer_attention_points = arr(
    item.institutional_review.reviewer_attention_points,
  );

  const eligibility = deriveEligibility(item.hard_gates);
  const blockingGaps = item.gaps.some(
    (gap) => gap.status !== "مغلقة" && ["مانع", "حرج"].includes(gap.severity),
  );
  item.eligibility = {
    ...eligibility,
    can_submit_now: eligibility.can_submit_now && !blockingGaps,
  };
  if (eligibility.can_submit_now && blockingGaps) {
    item.eligibility.reason =
      "بوابات الأهلية مستوفاة، لكن توجد فجوة مانعة أو حرجة يجب إغلاقها قبل الإرسال.";
  }

  return item;
}

function validateAssessmentData(assessment) {
  const errors = [];
  const warnings = [];
  if (!assessment?.project_snapshot?.project_title) errors.push("اسم المشروع غير موجود.");
  if (!assessment?.opportunity_snapshot?.opportunity_id)
    errors.push("معرف الفرصة غير موجود.");
  if (!assessment?.eligibility?.status) errors.push("لم يمكن اشتقاق حالة الأهلية.");
  if (assessment?.analysis_version !== ASSESSMENT_VERSION)
    errors.push("إصدار تحليل الملاءمة غير صالح.");
  if (!arr(assessment?.hard_gates).length)
    warnings.push("لم تحتوِ الفرصة على بوابات أهلية صارمة؛ يلزم تحقق بشري موسع.");
  if (assessment?.readiness?.assessment_confidence < 60)
    warnings.push("ثقة التقييم منخفضة؛ لا تستخدمه لاتخاذ قرار منفرد.");
  return { valid: errors.length === 0, errors, warnings };
}

function portfolioSort(a, b) {
  const aRank = STATUS_RANK[a?.assessment?.eligibility?.status] ?? 9;
  const bRank = STATUS_RANK[b?.assessment?.eligibility?.status] ?? 9;
  if (aRank !== bRank) return aRank - bRank;
  return (
    (b?.assessment?.readiness?.opportunity_readiness_score || 0) -
    (a?.assessment?.readiness?.opportunity_readiness_score || 0)
  );
}

module.exports = {
  ASSESSMENT_VERSION,
  FUNDING_DISCLAIMER,
  STATUS_RANK,
  mandatoryHardRequirements,
  deriveEligibility,
  normalizeAssessmentData,
  validateAssessmentData,
  portfolioSort,
};
