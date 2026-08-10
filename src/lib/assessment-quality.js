"use strict";

const { arr, clamp } = require("./opportunity-normalize");

const RUBRIC_VERSION = "rafid.deterministic-rubric.v2";
const ARABIC_STOP_WORDS = new Set([
  "التي", "الذي", "هذا", "هذه", "ذلك", "تلك", "على", "إلى", "الى", "من", "في", "عن",
  "مع", "أو", "او", "ثم", "كما", "يتم", "تم", "غير", "لدى", "بين", "ضمن", "عند",
]);

function present(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(present);
  if (typeof value === "object") return Object.values(value).some(present);
  if (typeof value === "string") return value.trim().length >= 3;
  return true;
}

function ratio(values) {
  const signals = values.map((value) => typeof value === "number" ? value : present(value) ? 1 : 0);
  return signals.length ? Math.round((signals.reduce((sum, value) => sum + value, 0) / signals.length) * 100) : 0;
}

function textTokens(value) {
  const text = Array.isArray(value) ? value.join(" ") : JSON.stringify(value || "");
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u064b-\u065f\u0670]/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !ARABIC_STOP_WORDS.has(token)),
  );
}

function lexicalAlignment(opportunity, project) {
  const opportunityTokens = textTokens([
    opportunity?.purpose_and_scope,
    opportunity?.requirements,
    opportunity?.evaluation_criteria,
  ]);
  const projectTokens = textTokens([
    project?.project_identity?.field,
    project?.project_identity?.project_type,
    project?.problem,
    project?.solution,
    project?.impact,
  ]);
  if (!opportunityTokens.size || !projectTokens.size) return 0;
  let shared = 0;
  for (const token of opportunityTokens) if (projectTokens.has(token)) shared += 1;
  return Math.min(1, shared / Math.max(5, Math.min(opportunityTokens.size, projectTokens.size)));
}

function evidenceWeight(value) {
  const status = String(value || "");
  if (/صريح|مثبت$|مؤكد|متاح/.test(status)) return 1;
  if (/جزئي|مسودة/.test(status)) return 0.55;
  if (/غير مباشر|غير واضح/.test(status)) return 0.3;
  return 0;
}

function buildEvidenceLedger(project, gates = []) {
  const ledger = [];
  const add = (category, statement, source, strength) => {
    const clean = String(statement || "").trim();
    if (!clean || /غير (متوفر|موضح|موجود)/.test(clean)) return;
    const key = `${category}|${clean}|${source}`;
    if (ledger.some((entry) => entry.key === key)) return;
    ledger.push({ key, category, statement: clean, source: String(source || "المادة المرفوعة"), strength: String(strength || "غير مباشر") });
  };

  for (const item of arr(project?.problem?.supporting_evidence))
    add("المشكلة", item.evidence, item.source, item.evidence_status);
  for (const item of arr(project?.claims_and_evidence))
    add(item.claim_type || "ادعاء", item.available_evidence || item.claim, item.evidence_source, item.evidence_status);
  for (const item of arr(project?.beneficiaries_and_market?.market_validation))
    add("تحقق المستفيد أو السوق", item.result, item.evidence_reference, item.evidence_available ? "مثبت" : "غير مباشر");
  for (const result of arr(project?.prototype_and_data?.test_results))
    add("اختبار", result, project?.prototype_and_data?.test_environment, "جزئي");
  for (const partner of arr(project?.partnerships?.existing_partners))
    add("شراكة", `${partner.organization}: ${partner.evidence || partner.relationship_type}`, partner.evidence, partner.status);
  for (const gate of arr(gates)) {
    for (const item of arr(gate.project_evidence))
      add("شرط أهلية", item.evidence || item, item.source || gate.requirement, item.strength || "جزئي");
  }
  return ledger.slice(0, 40).map(({ category, statement, source, strength }) => ({
    category,
    statement,
    source,
    strength,
  }));
}

function detectContradictions(project) {
  const contradictions = arr(project?.contradictions).map((item) => ({
    topic: item.topic || "تعارض مستخرج",
    first_statement: item.first_statement || "غير موضح",
    conflicting_statement: item.conflicting_statement || "غير موضح",
    clarification_needed: item.clarification_needed || "اطلب توضيحًا موثقًا من فريق المشروع.",
    source: "مستخرج من البحث",
  }));
  const add = (topic, first, second, clarification) => contradictions.push({
    topic,
    first_statement: first,
    conflicting_statement: second,
    clarification_needed: clarification,
    source: "تحقق حتمي من الحقول",
  });
  const prototype = project?.prototype_and_data || {};
  if (prototype.prototype_exists === false && present([prototype.prototype_description, prototype.tests_completed, prototype.test_results]))
    add("حالة النموذج الأولي", "لا يوجد نموذج أولي", "توجد أوصاف أو اختبارات لنموذج", "حدد ما إذا كان الموجود نموذجًا أوليًا وما مرحلته بدقة.");
  if (prototype.data_available === false && present([prototype.data_description, prototype.data_source, prototype.data_size]))
    add("توفر البيانات", "البيانات غير متاحة", "توجد تفاصيل عن بيانات متاحة", "وحّد حالة البيانات وحدد ما يمكن الوصول إليه فعليًا.");
  const budget = project?.budget || {};
  if (Number.isFinite(budget.requested_amount) && Number.isFinite(budget.budget_range?.maximum) && budget.requested_amount > budget.budget_range.maximum)
    add("الميزانية", `المبلغ المطلوب ${budget.requested_amount}`, `الحد الأعلى ${budget.budget_range.maximum}`, "صحح النطاق أو المبلغ المطلوب وأرفق أساس التقدير.");
  if (budget.budget_status === "مفصلة" && !arr(budget.budget_items).length)
    add("تفصيل الميزانية", "حالة الميزانية: مفصلة", "لا توجد بنود ميزانية", "أضف البنود أو غيّر الحالة إلى تقديرية.");
  for (const claim of arr(project?.claims_and_evidence)) {
    if (claim.evidence_status === "مثبت" && !present([claim.available_evidence, claim.evidence_source]))
      add("ادعاء بلا مرجع", claim.claim || "ادعاء مثبت", "لا يوجد دليل أو مصدر", "أرفق مرجعًا قابلًا للتحقق أو خفّض حالة الإثبات.");
  }
  return contradictions.slice(0, 20);
}

function deterministicDimensions({ opportunity, project, gates }) {
  const knownGates = arr(gates).filter((gate) => !["غير معروف"].includes(gate.status));
  const closedGates = arr(gates).filter((gate) => ["مستوفى", "لا ينطبق"].includes(gate.status));
  const gateKnowledge = arr(gates).length ? knownGates.length / arr(gates).length : 0.5;
  const gateClosure = arr(gates).length ? closedGates.length / arr(gates).length : 0.5;
  const overlap = lexicalAlignment(opportunity, project);
  const metrics = arr(project?.impact?.target_metrics);
  const evidenceClaims = arr(project?.claims_and_evidence).filter((item) => evidenceWeight(item.evidence_status) > 0);
  const dimensions = [
    ["توافق النطاق", 15, [opportunity?.purpose_and_scope?.objectives, project?.project_identity?.field, project?.project_identity?.project_type, overlap, gateKnowledge, gateClosure], "اربط مجال المشروع وأهدافه حرفيًا بنطاق الفرصة وشروطها."],
    ["قوة المشكلة", 12, [project?.problem?.problem_statement, project?.problem?.problem_scale, project?.problem?.who_experiences_the_problem, project?.problem?.current_alternatives, project?.problem?.supporting_evidence], "أثبت حجم المشكلة والمستفيد والبدائل الحالية بمراجع قابلة للتحقق."],
    ["قوة الحل", 12, [project?.solution?.solution_summary, project?.solution?.how_it_works, project?.solution?.main_components, project?.solution?.innovation_or_differentiation, project?.solution?.limitations], "وضح آلية الحل وتميزه وحدوده وصلته المباشرة بالمشكلة."],
    ["الأدلة والاختبارات", 12, [project?.prototype_and_data?.prototype_exists, project?.prototype_and_data?.tests_completed, project?.prototype_and_data?.test_results, project?.prototype_and_data?.data_available, evidenceClaims], "أرفق نتائج اختبار ومصادر أدلة يمكن للمراجع إعادة التحقق منها."],
    ["الفريق والشراكات", 10, [project?.project_identity?.team_members, project?.partnerships?.existing_partners, project?.partnerships?.letters_of_interest, project?.partnerships?.required_partners], "حدد الأدوار والخبرات وأرفق خطابات التزام الشركاء."],
    ["خطة التنفيذ", 10, [project?.implementation_plan?.implementation_summary, project?.implementation_plan?.duration, project?.implementation_plan?.phases, project?.implementation_plan?.required_resources, project?.implementation_plan?.required_approvals], "حوّل التنفيذ إلى مراحل ومخرجات ومسؤوليات واعتمادات وجدول زمني."],
    ["الميزانية", 10, [project?.budget?.requested_amount, project?.budget?.budget_items, arr(project?.budget?.budget_items).some((item) => present(item.basis_of_estimate)), project?.budget?.budget_assumptions, project?.budget?.co_funding_or_in_kind_support], "اربط كل بند بتكلفته وأساس تقديره ومخرج تنفيذي محدد."],
    ["الأثر", 10, [project?.impact?.expected_impact, project?.beneficiaries_and_market?.primary_beneficiaries, metrics, metrics.some((item) => present(item.measurement_method)), project?.impact?.economic_impact || project?.impact?.social_impact], "حدد أثرًا قابلًا للقياس وخط أساس وطريقة قياس وتاريخًا مستهدفًا."],
    ["معايير المفاضلة", 9, [opportunity?.evaluation_criteria, gateKnowledge, overlap, evidenceClaims, project?.claims_and_evidence], "أنشئ مصفوفة تربط كل معيار مفاضلة بادعاء ودليل وموضعه في الملف."],
  ];
  return dimensions.map(([dimension, weight_percent, signals, improvement]) => ({
    dimension,
    score: ratio(signals),
    weight_percent,
    rationale: `حُسبت الدرجة حتميًا من ${signals.filter((value) => typeof value === "number" ? value > 0 : present(value)).length} من ${signals.length} مؤشرات قابلة للتحقق.`,
    evidence: [],
    improvement,
    score_basis: "rubric_deterministic",
  }));
}

function applySecondReview(assessment, { opportunity, project } = {}) {
  const corrections = [];
  for (const gate of arr(assessment.hard_gates)) {
    if (gate.status === "مستوفى" && !arr(gate.project_evidence).some((item) => evidenceWeight(item.strength) > 0)) {
      gate.status = "غير معروف";
      gate.resolution = "يحتاج تحقق";
      gate.verdict_basis = "صحح المراجع الثاني الحكم: لا يجوز اعتماد الشرط مستوفى دون دليل مشروع قابل للمراجعة.";
      gate.missing_evidence = arr(gate.missing_evidence).length ? gate.missing_evidence : ["دليل صريح يثبت استيفاء الشرط"];
      corrections.push(`خُفض شرط «${gate.requirement}» من مستوفى إلى غير معروف لغياب الدليل.`);
    }
  }
  const contradictions = detectContradictions(project);
  const evidenceLedger = buildEvidenceLedger(project, assessment.hard_gates);
  assessment.fit_dimensions = deterministicDimensions({ opportunity, project, gates: assessment.hard_gates });
  const readinessScore = Math.round(assessment.fit_dimensions.reduce((sum, item) => sum + item.score * item.weight_percent, 0) / 100);
  const evidenceScore = Math.round(
    (evidenceLedger.reduce((sum, item) => sum + evidenceWeight(item.strength), 0) / Math.max(8, evidenceLedger.length)) * 100,
  );
  const projectConfidence = clamp(project?.source_summary?.extraction_confidence || 0);
  const opportunityConfidence = clamp(opportunity?.source_summary?.extraction_confidence || 0);
  const computedConfidence = clamp(Math.round(projectConfidence * 0.45 + opportunityConfidence * 0.35 + evidenceScore * 0.2 - contradictions.length * 4));
  assessment.readiness ||= {};
  assessment.readiness.opportunity_readiness_score = readinessScore;
  assessment.readiness.evidence_strength_score = clamp(evidenceScore);
  assessment.readiness.assessment_confidence = Math.min(
    clamp(assessment.readiness.assessment_confidence || computedConfidence),
    computedConfidence,
  );
  assessment.quality_review = {
    rubric_version: RUBRIC_VERSION,
    score_method: "حتمي من مؤشرات وأدلة منظمة",
    second_review_passed: true,
    corrections_count: corrections.length,
    corrections,
    evidence_coverage_score: clamp(evidenceScore),
    evidence_ledger: evidenceLedger,
    contradictions,
    contradiction_count: contradictions.length,
  };
  return assessment;
}

module.exports = {
  RUBRIC_VERSION,
  buildEvidenceLedger,
  detectContradictions,
  deterministicDimensions,
  applySecondReview,
};
