"use strict";

const { FUNDING_CATALOG, CATALOG_VERSION, VERIFIED_AT } = require("../data/funding-catalog");
const { publishableCatalog, publicOpportunity, evaluateStrictGates } = require("./funding-registry");
const { normalizeProjectData, validateProjectData, arr } = require("./normalize");

const DISCOVERY_VERSION = "rafid.opportunity-discovery.v1";
const DIMENSION_WEIGHTS = Object.freeze({
  scope: 30,
  project_type: 15,
  maturity: 15,
  impact: 15,
  evidence: 10,
  team: 5,
  budget: 5,
  timing: 5,
});

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function normalizeArabic(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalizeArabic(value).split(/\s+/).filter((token) => token.length >= 3));
}

function flattenText(value, output = []) {
  if (value === null || value === undefined) return output;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenText(entry, output));
    return output;
  }
  if (typeof value === "object") Object.values(value).forEach((entry) => flattenText(entry, output));
  return output;
}

function projectSignals(project) {
  const searchable = [
    project?.project_identity,
    project?.problem,
    project?.solution,
    project?.beneficiaries_and_market,
    project?.impact,
    project?.funding_request,
    project?.prototype_and_data,
  ];
  const text = flattenText(searchable).join(" ");
  return {
    text,
    tokens: tokens(text),
    trl: Number.isFinite(Number(project?.project_stage?.trl_estimate))
      ? Number(project.project_stage.trl_estimate)
      : null,
    projectTypes: arr(project?.project_identity?.project_type),
    hasImpact: flattenText(project?.impact).join(" ").trim().length > 20,
    hasEvidence: arr(project?.claims_and_evidence).some((item) => item?.evidence_status === "مثبت" || item?.evidence_status === "مثبت جزئيًا")
      || arr(project?.prototype_and_data?.test_results).length > 0,
    hasTeam: arr(project?.project_identity?.team_members).length > 0,
    hasBudget: Number(project?.budget?.requested_amount) > 0 || arr(project?.budget?.budget_items).length > 0,
    confidence: clamp(project?.source_summary?.extraction_confidence),
  };
}

function keywordFit(signals, opportunity) {
  const targets = [...arr(opportunity.keywords), ...arr(opportunity.priority_areas)];
  const targetTokens = tokens(targets.join(" "));
  if (!targetTokens.size) return { score: 40, matches: [] };
  const matches = [...targetTokens].filter((token) => signals.tokens.has(token));
  const score = matches.length ? Math.min(100, 35 + matches.length * 13) : 20;
  return { score, matches: matches.slice(0, 8) };
}

function typeFit(signals, opportunity) {
  const projectTypeText = normalizeArabic(signals.projectTypes.join(" "));
  const targetTypes = arr(opportunity.target_project_types);
  const matches = targetTypes.filter((type) => {
    const normalized = normalizeArabic(type);
    return normalized && (projectTypeText.includes(normalized) || normalizeArabic(signals.text).includes(normalized));
  });
  if (!signals.projectTypes.length) return { score: 35, matches: [] };
  return { score: matches.length ? 85 : 30, matches };
}

function maturityFit(signals, opportunity) {
  if (signals.trl === null) return { score: 40, note: "مستوى الجاهزية التقنية غير موضح." };
  const min = opportunity.min_trl;
  const max = opportunity.max_trl;
  if (min !== null && signals.trl < min) return { score: 20, note: `TRL ${signals.trl} أقل من النطاق الإرشادي ${min}–${max ?? 9}.` };
  if (max !== null && signals.trl > max) return { score: 35, note: `TRL ${signals.trl} أعلى من النطاق الإرشادي ${min ?? 1}–${max}.` };
  return { score: 90, note: `TRL ${signals.trl} داخل النطاق الإرشادي.` };
}

function statusFor(score, known = true) {
  if (!known) return "غير محسوم";
  if (score >= 75) return "متوافق";
  if (score >= 45) return "جزئي";
  return "ضعيف";
}

function dimension(id, label, score, rationale, evidence = []) {
  const weight = DIMENSION_WEIGHTS[id];
  return {
    dimension_id: id,
    label,
    weight_percent: weight,
    score: clamp(score),
    weighted_score: Math.round(clamp(score) * weight) / 100,
    status: statusFor(score, !/غير موضح|تحقق/.test(rationale)),
    rationale,
    evidence,
  };
}

function matchOpportunity(project, opportunity) {
  const signals = projectSignals(project);
  const scope = keywordFit(signals, opportunity);
  const type = typeFit(signals, opportunity);
  const maturity = maturityFit(signals, opportunity);
  const dimensions = [
    dimension("scope", "توافق المجال والأولوية", scope.score, scope.matches.length ? `تقاطعت إشارات المشروع مع: ${scope.matches.join("، ")}.` : "لم يظهر تطابق لفظي كافٍ؛ يلزم فحص النطاق الرسمي.", scope.matches),
    dimension("project_type", "نوع المشروع", type.score, type.matches.length ? `نوع المشروع يتقاطع مع: ${type.matches.join("، ")}.` : "نوع المشروع غير محسوم أو لا يطابق الوصف الإرشادي.", type.matches),
    dimension("maturity", "مرحلة الجاهزية", maturity.score, maturity.note, signals.trl === null ? [] : [`TRL ${signals.trl}`]),
    dimension("impact", "وضوح الأثر", signals.hasImpact ? 80 : 25, signals.hasImpact ? "توجد معلومات أثر في المشروع." : "الأثر أو مؤشراته غير موضحة بما يكفي."),
    dimension("evidence", "قوة الأدلة", signals.hasEvidence ? 80 : 20, signals.hasEvidence ? "توجد نتائج أو ادعاءات مدعومة جزئيًا على الأقل." : "لم توجد نتائج أو أدلة منظمة كافية."),
    dimension("team", "الفريق", signals.hasTeam ? 80 : 30, signals.hasTeam ? "توجد أدوار فريق منظمة." : "الفريق وأدواره غير موضحة."),
    dimension("budget", "الميزانية", signals.hasBudget ? 75 : 25, signals.hasBudget ? "توجد بيانات ميزانية أولية." : "الميزانية غير موضحة."),
    dimension("timing", "قابلية التقديم الآن", 25, "حالة فتح الدعوة والموعد يجب التحقق منهما في المصدر الرسمي."),
  ];
  const score = Math.round(dimensions.reduce((sum, item) => sum + item.weighted_score, 0));
  const missing = [];
  if (!signals.hasEvidence) missing.push("أدلة النتائج والاختبارات");
  if (!signals.hasBudget) missing.push("ميزانية مبررة");
  if (!signals.hasTeam) missing.push("أدوار الفريق");
  if (signals.trl === null) missing.push("مستوى الجاهزية التقنية");
  missing.push("تأكيد أن الدعوة مفتوحة وشروط الدورة الحالية");
  const deterministicGates = evaluateStrictGates({ application_status: opportunity.application_status }, opportunity);
  return {
    opportunity: {
      opportunity_id: opportunity.opportunity_id,
      title: opportunity.title,
      funder: opportunity.funder,
      summary: opportunity.summary,
      official_url: opportunity.official_url,
      supporting_source_url: opportunity.supporting_source_url,
      application_status: opportunity.application_status,
      deadline: opportunity.deadline,
      last_verified_at: opportunity.last_verified_at,
    },
    preliminary_eligibility: "غير محسوم",
    match_score: score,
    confidence_score: Math.min(70, Math.round((signals.confidence + (scope.matches.length ? 60 : 25)) / 2)),
    dimensions,
    why_recommended: dimensions.filter((item) => item.score >= 70).slice(0, 3).map((item) => `${item.label}: ${item.rationale}`),
    missing_for_decision: missing,
    deterministic_gates: deterministicGates,
    hard_gate_warning: "الترتيب تمهيدي؛ لا تصبح الفرصة مؤهلة قبل التحقق من الدعوة الحالية وجميع الشروط الصارمة.",
  };
}

function discoverOpportunities(projectInput, options = {}) {
  const project = normalizeProjectData(projectInput || {});
  const validation = validateProjectData(project);
  if (!validation.valid) {
    const error = new Error(`بيانات المشروع غير صالحة: ${validation.errors.join(" ")}`);
    error.statusCode = 422;
    error.code = "RAFID_INVALID_PROJECT";
    throw error;
  }
  const query = normalizeArabic(options.query);
  const funder = normalizeArabic(options.funder);
  const limit = Math.max(1, Math.min(20, Number.parseInt(options.limit || "8", 10)));
  const catalog = publishableCatalog(arr(options.catalog).length ? options.catalog : FUNDING_CATALOG);
  const filtered = catalog.filter((item) => {
    const haystack = normalizeArabic(`${item.title} ${item.funder} ${item.summary} ${arr(item.keywords).join(" ")}`);
    return (!query || haystack.includes(query)) && (!funder || normalizeArabic(item.funder).includes(funder));
  });
  const matches = filtered
    .map((item) => matchOpportunity(project, item))
    .sort((a, b) => b.match_score - a.match_score || b.confidence_score - a.confidence_score)
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  return {
    discovery_version: DISCOVERY_VERSION,
    catalog_version: CATALOG_VERSION,
    catalog_verified_at: VERIFIED_AT,
    generated_at: new Date().toISOString(),
    project_summary: {
      title: project.project_identity.project_title || "بحث غير مسمى",
      field: arr(project.project_identity.field),
      project_type: arr(project.project_identity.project_type),
      trl: project.project_stage.trl_estimate,
    },
    total_catalog_items: catalog.length,
    considered_items: filtered.length,
    matches,
    methodology: {
      deterministic: true,
      weights: DIMENSION_WEIGHTS,
      score_does_not_confirm_eligibility: true,
      no_win_probability: true,
    },
    disclaimer: "هذه ترشيحات تمهيدية من كتالوج موثق المصدر وليست تأكيدًا لفتح التقديم أو الأهلية أو الفوز. راجع الرابط الرسمي والدعوة الحالية قبل أي قرار.",
  };
}

function publicCatalog() {
  const approved = publishableCatalog(FUNDING_CATALOG);
  return {
    catalog_version: CATALOG_VERSION,
    verified_at: VERIFIED_AT,
    review_policy: "human_approval_required_before_publication",
    opportunities: approved.map(publicOpportunity),
    notice: "وجود البرنامج في الكتالوج لا يعني أن التقديم مفتوح. حالة الدورة تُراجع في المصدر الرسمي.",
  };
}

module.exports = {
  DISCOVERY_VERSION,
  DIMENSION_WEIGHTS,
  normalizeArabic,
  matchOpportunity,
  discoverOpportunities,
  publicCatalog,
};
