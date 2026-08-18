"use strict";

const { arr, clamp, stableId } = require("./opportunity-normalize");

const RUBRIC_VERSION = "rafid.deterministic-rubric.v3";
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
  const signals = values.map((value) => {
    if (typeof value !== "number") return present(value) ? 1 : 0;
    if (!Number.isFinite(value)) return 0;
    return value >= 0 && value <= 1 ? value : 1;
  });
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

function evidenceLocator(...values) {
  const text = values.map((value) => String(value || "")).join(" ");
  const page = text.match(/(?:صفحة|ص\.?|page|p\.)\s*[:#-]?\s*(\d{1,4})/iu);
  const section = text.match(/(?:قسم|section)\s*[:#-]?\s*([^،.;|]{2,80})/iu);
  if (page) return { type: "page", value: page[1], label: `صفحة ${page[1]}` };
  if (section) return { type: "section", value: section[1].trim(), label: `قسم ${section[1].trim()}` };
  return { type: "source", value: null, label: "المصدر دون موضع محدد" };
}

function buildEvidenceLedger(project, gates = []) {
  const ledger = [];
  const add = (category, statement, source, strength, claimType = "fact") => {
    const clean = String(statement || "").trim();
    if (!clean || /غير (متوفر|موضح|موجود)/.test(clean)) return;
    const key = `${category}|${clean}|${source}`;
    if (ledger.some((entry) => entry.key === key)) return;
    const cleanSource = String(source || "المادة المرفوعة");
    ledger.push({
      key,
      evidence_id: stableId("ev", category, clean, cleanSource),
      category,
      statement: clean,
      source: cleanSource,
      locator: evidenceLocator(cleanSource, clean),
      strength: String(strength || "غير مباشر"),
      claim_type: claimType,
      verification_status: evidenceWeight(strength) >= 0.55 ? "مدعوم من المصدر" : "يحتاج تحقق",
    });
  };

  // حقائق مستقلة عن رأي المقيم. كل حقيقة تبقى منفصلة عن الاستنتاج والدرجة.
  add("المشكلة", project?.problem?.problem_statement, "قسم المشكلة في البحث", "صريح");
  add("الحل", project?.solution?.solution_summary, "قسم الحل في البحث", "صريح");
  add("النطاق", project?.project_identity?.field, "بيانات المشروع المنظمة", "جزئي");
  add("النطاق", arr(project?.project_identity?.project_type).join("؛ "), "بيانات المشروع المنظمة", "جزئي");
  add("التنفيذ", project?.implementation_plan?.implementation_summary, "قسم خطة التنفيذ", "صريح");
  add("التنفيذ", project?.implementation_plan?.duration, "قسم خطة التنفيذ", "جزئي");
  add("الميزانية", project?.budget?.requested_amount, "قسم الميزانية", "جزئي");
  add("الميزانية", arr(project?.budget?.budget_items).map((item) => item.item).join("؛ "), "قسم الميزانية", "جزئي");
  add("الأثر", arr(project?.impact?.expected_impact).join("؛ "), "قسم الأثر", "صريح");
  add("الأثر", arr(project?.impact?.target_metrics).map((item) => item.metric).join("؛ "), "قسم مؤشرات الأثر", "جزئي");
  add("الفريق", arr(project?.project_identity?.team_members).map((item) => `${item.role || "عضو"}: ${item.specialization || item.relevant_experience || ""}`).join("؛ "), "قسم الفريق", "جزئي");

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
      add("شرط أهلية", item.evidence || item, item.source || gate.requirement, item.strength || "جزئي", "eligibility_evidence");
  }
  return ledger.slice(0, 60).map((entry) => ({
    evidence_id: entry.evidence_id,
    category: entry.category,
    statement: entry.statement,
    source: entry.source,
    locator: entry.locator,
    strength: entry.strength,
    claim_type: entry.claim_type,
    verification_status: entry.verification_status,
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

const DIMENSION_EVIDENCE_CATEGORIES = {
  "توافق النطاق": new Set(["النطاق", "شرط أهلية"]),
  "قوة المشكلة": new Set(["المشكلة"]),
  "قوة الحل": new Set(["الحل", "ادعاء", "تقني", "بحثي"]),
  "الأدلة والاختبارات": new Set(["اختبار", "تحقق المستفيد أو السوق", "تقني", "بحثي"]),
  "الفريق والشراكات": new Set(["الفريق", "شراكة"]),
  "خطة التنفيذ": new Set(["التنفيذ"]),
  "الميزانية": new Set(["الميزانية", "مالي"]),
  "الأثر": new Set(["الأثر", "اجتماعي", "اقتصادي", "بيئي", "سوقي"]),
  "معايير المفاضلة": new Set(["شرط أهلية", "ادعاء", "تقني", "بحثي", "اجتماعي", "اقتصادي", "بيئي", "سوقي"]),
};

function deterministicDimensions({ opportunity, project, gates, evidenceLedger = buildEvidenceLedger(project, gates) }) {
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
  return dimensions.map(([dimension, weight_percent, signals, improvement]) => {
    const supportedSignals = signals.filter((value) => typeof value === "number" ? value > 0 : present(value)).length;
    const relevantCategories = DIMENSION_EVIDENCE_CATEGORIES[dimension] || new Set();
    const evidence = evidenceLedger.filter((entry) => relevantCategories.has(entry.category)).slice(0, 6);
    const informationCoverage = signals.length ? supportedSignals / signals.length : 0;
    const evidenceCoverage = Math.min(1, evidence.reduce((sum, entry) => sum + evidenceWeight(entry.strength), 0) / 2);
    const confidence = clamp(Math.round(informationCoverage * 55 + evidenceCoverage * 45));
    const scoreAvailable = confidence >= 35 && evidence.length > 0;
    const computedScore = ratio(signals);
    const lower = Math.max(0, Math.floor(computedScore / 10) * 10 - 5);
    const upper = Math.min(100, lower + 15);
    return {
      dimension,
      score: scoreAvailable ? computedScore : null,
      score_available: scoreAvailable,
      score_range: scoreAvailable ? null : { minimum: lower, maximum: upper },
      confidence,
      weight_percent,
      rationale: scoreAvailable
        ? `حُسبت الدرجة حتميًا من ${supportedSignals} من ${signals.length} مؤشرات، وربطت بـ${evidence.length} أدلة مستقلة.`
        : `البيانات غير كافية لدرجة دقيقة: توفر ${supportedSignals} من ${signals.length} مؤشرات و${evidence.length} أدلة.`,
      evidence: evidence.length ? evidence.map((entry) => entry.evidence_id) : ["لا يوجد دليل"],
      improvement,
      score_basis: scoreAvailable ? "rubric_deterministic" : "insufficient_evidence",
    };
  });
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
  assessment.fit_dimensions = deterministicDimensions({ opportunity, project, gates: assessment.hard_gates, evidenceLedger });
  const scoredDimensions = assessment.fit_dimensions.filter((item) => item.score_available);
  const scoredWeight = scoredDimensions.reduce((sum, item) => sum + item.weight_percent, 0);
  const readinessScore = scoredWeight
    ? Math.round(scoredDimensions.reduce((sum, item) => sum + item.score * item.weight_percent, 0) / scoredWeight)
    : null;
  const evidenceScore = Math.round(
    (evidenceLedger.reduce((sum, item) => sum + evidenceWeight(item.strength), 0) / Math.max(8, evidenceLedger.length)) * 100,
  );
  const projectConfidence = clamp(project?.source_summary?.extraction_confidence || 0);
  const opportunityConfidence = clamp(opportunity?.source_summary?.extraction_confidence || 0);
  const computedConfidence = clamp(Math.round(projectConfidence * 0.45 + opportunityConfidence * 0.35 + evidenceScore * 0.2 - contradictions.length * 4));
  assessment.readiness ||= {};
  const overallScoreAvailable = scoredWeight === 100 && evidenceLedger.length >= 4 && projectConfidence >= 40 && contradictions.length === 0;
  assessment.readiness.opportunity_readiness_score = overallScoreAvailable ? readinessScore : null;
  assessment.readiness.score_available = overallScoreAvailable;
  assessment.readiness.score_status = overallScoreAvailable ? "قابل للتقدير" : "بيانات غير كافية لدرجة دقيقة";
  assessment.readiness.score_range = overallScoreAvailable || readinessScore === null
    ? null
    : { minimum: Math.max(0, readinessScore - 10), maximum: Math.min(100, readinessScore + 10) };
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
    scored_weight_percent: scoredWeight,
    unscored_dimensions: assessment.fit_dimensions.filter((item) => !item.score_available).map((item) => item.dimension),
  };
  return assessment;
}

function compareAssessmentRounds(previous, current) {
  if (!previous || !current) return null;
  if (previous?.opportunity_snapshot?.opportunity_id !== current?.opportunity_snapshot?.opportunity_id) return null;
  const previousRawScore = previous?.readiness?.opportunity_readiness_score;
  const currentRawScore = current?.readiness?.opportunity_readiness_score;
  const previousScore = previousRawScore === null || previousRawScore === undefined ? NaN : Number(previousRawScore);
  const currentScore = currentRawScore === null || currentRawScore === undefined ? NaN : Number(currentRawScore);
  const previousGaps = new Set(arr(previous?.gaps).filter((item) => item.status !== "مغلقة").map((item) => item.gap_id || item.title));
  const currentGaps = new Set(arr(current?.gaps).filter((item) => item.status !== "مغلقة").map((item) => item.gap_id || item.title));
  const closed = [...previousGaps].filter((item) => !currentGaps.has(item));
  const opened = [...currentGaps].filter((item) => !previousGaps.has(item));
  return {
    comparison_version: "rafid.round-comparison.v1",
    comparable_score: Number.isFinite(previousScore) && Number.isFinite(currentScore),
    score_change: Number.isFinite(previousScore) && Number.isFinite(currentScore) ? currentScore - previousScore : null,
    previous_eligibility: previous?.eligibility?.status || "غير محسوم",
    current_eligibility: current?.eligibility?.status || "غير محسوم",
    closed_gap_count: closed.length,
    new_gap_count: opened.length,
    closed_gap_ids: closed,
    new_gap_ids: opened,
    evidence_change: clamp(current?.readiness?.evidence_strength_score || 0) - clamp(previous?.readiness?.evidence_strength_score || 0),
    confidence_change: clamp(current?.readiness?.assessment_confidence || 0) - clamp(previous?.readiness?.assessment_confidence || 0),
  };
}

module.exports = {
  RUBRIC_VERSION,
  buildEvidenceLedger,
  detectContradictions,
  deterministicDimensions,
  applySecondReview,
  compareAssessmentRounds,
  evidenceLocator,
  evidenceWeight,
};
