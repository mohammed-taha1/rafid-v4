"use strict";

const FIELDS = ["المياه", "الصحة", "الطاقة", "التعليم"];
const LANGUAGES = ["ar", "en"];
const SOURCE_TYPES = ["pdf", "docx", "txt"];

function opportunity(id, language, field) {
  const english = language === "en";
  return {
    identity: { opportunity_id: `opp-${id}`, title: english ? `${field} innovation grant` : `منحة ابتكار ${field}`, funder: "جهة اختبار", deadline: "2027-12-31" },
    purpose_and_scope: { objectives: [english ? `Applied innovation in ${field}` : `ابتكار تطبيقي في ${field}`], eligible_fields: [field], eligible_project_types: ["بحث تطبيقي"] },
    requirements: [{
      requirement_id: `gate-${id}`,
      requirement_type: "إلزامي",
      gate_type: "بوابة صارمة",
      title: english ? "Accredited host letter" : "خطاب جهة حاضنة معتمدة",
      description: english ? "An accredited host letter is mandatory" : "يشترط خطاب جهة حاضنة معتمدة",
      evidence_required: [english ? "Official host letter" : "خطاب رسمي من الجهة"],
      source_quote: english ? "Applicants must attach an official host letter (page 2)." : "يجب إرفاق خطاب رسمي من الجهة (صفحة 2).",
    }],
    evaluation_criteria: [{ criterion: english ? "Impact" : "الأثر", weight: 30 }],
    submission_documents: [{ document_id: `doc-${id}`, name: english ? "Executive summary" : "الملخص التنفيذي", mandatory: true, description: "ملخص" }],
    source_summary: { extraction_confidence: 88, information_completeness: "مرتفعة", sections_reviewed: ["صفحة 2"] },
  };
}

function completeProject(id, language, field, sourceType) {
  const english = language === "en";
  return {
    project_identity: {
      project_title: english ? `${field} applied project ${id}` : `مشروع ${field} التطبيقي ${id}`,
      project_type: ["بحث تطبيقي"], field, university: "جامعة اختبار",
      project_owner: { name: null },
      team_members: [{ role: english ? "Principal investigator" : "الباحث الرئيس", specialization: field, relevant_experience: "5 years" }],
    },
    project_stage: { current_stage: "نموذج أولي" },
    problem: { problem_statement: english ? `A measurable ${field} problem affects beneficiaries.` : `مشكلة قابلة للقياس في ${field} تؤثر في المستفيدين.`, problem_scale: "1000 مستفيد", who_experiences_the_problem: ["مستفيدون"], current_alternatives: ["حل تقليدي"], supporting_evidence: [{ evidence: "قياس خط أساس", source: english ? "Baseline report page 3" : "تقرير خط الأساس صفحة 3", evidence_status: "مثبت" }] },
    solution: { solution_summary: english ? "A tested applied solution." : "حل تطبيقي جرى اختباره.", how_it_works: "آلية موثقة", main_components: ["مكون"], innovation_or_differentiation: "تحسين قابل للقياس", limitations: ["نطاق تجريبي"] },
    beneficiaries_and_market: { primary_beneficiaries: ["مستفيدون"], first_target_segment: "قطاع تجريبي", market_validation: [{ result: "مقابلات إيجابية", evidence_available: true, evidence_reference: "صفحة 4" }] },
    prototype_and_data: { prototype_exists: true, prototype_description: "نموذج يعمل", tests_completed: ["اختبار مخبري"], test_results: ["تحسن 20% صفحة 5"], test_environment: "مختبر", data_available: true, data_description: "بيانات اختبار", data_source: "المختبر", data_size: "100 سجل" },
    claims_and_evidence: [{ claim: "تحسن الأداء", claim_type: "تقني", evidence_status: "مثبت", available_evidence: "تحسن 20%", evidence_source: "تقرير الاختبار صفحة 5", additional_evidence_needed: "تحقق ميداني" }],
    partnerships: { existing_partners: [{ organization: "جامعة اختبار", relationship_type: "حاضن", status: "مؤكد", evidence: "خطاب رسمي صفحة 2" }], required_partners: [], letters_of_interest: ["خطاب رسمي"] },
    implementation_plan: { implementation_summary: "ثلاث مراحل مترابطة", duration: "12 شهرًا", phases: [{ phase: "تجربة", duration: "4 أشهر", activities: ["اختبار"], deliverables: ["تقرير"] }], required_resources: ["مختبر"], required_approvals: [] },
    budget: { requested_amount: 250000, budget_range: { minimum: 200000, maximum: 300000 }, budget_status: "مفصلة", budget_items: [{ item: "أجهزة", basis_of_estimate: "عرض سعر" }], budget_assumptions: ["مدة 12 شهرًا"], co_funding_or_in_kind_support: "مختبر" },
    impact: { expected_impact: ["خفض التكلفة"], target_metrics: [{ metric: "خفض التكلفة", measurement_method: "قبل وبعد" }], economic_impact: "خفض تكلفة", social_impact: "تحسين الخدمة" },
    funding_request: { funding_needed_for: ["الاختبار الميداني"] },
    contradictions: [], missing_information: [],
    source_summary: { extraction_confidence: 90, information_completeness: "مرتفعة", sources_reviewed: [`research.${sourceType}`] },
  };
}

function modelJudgment(id, mode, language) {
  const evidence = language === "en" ? "Official host letter, page 2" : "خطاب رسمي من الجهة، صفحة 2";
  const base = {
    hard_gates: [{ requirement_id: `gate-${id}`, status: "مستوفى", verdict_basis: "الدليل مذكور", project_evidence: [evidence], missing_evidence: [], remediation: "" }],
    fit_dimensions: [], readiness: { assessment_confidence: 95, evidence_strength_score: 90, summary: "" },
    institutional_review: { recommendation: "يوصى بالتقديم", rationale: "", questions_for_project_team: [], questions_for_funder: [], reviewer_attention_points: [], institutional_review_required: true },
    risk_disclosures: [],
  };
  if (mode === "missing" || mode === "weak" || mode === "contradictory") base.hard_gates[0].project_evidence = [];
  if (mode === "conditional") {
    base.hard_gates[0].status = "مستوفى جزئيًا";
    base.hard_gates[0].project_evidence = [language === "en" ? "Draft letter" : "مسودة خطاب"];
    base.hard_gates[0].missing_evidence = [language === "en" ? "Signed letter" : "خطاب موقع"];
    base.hard_gates[0].remediation = language === "en" ? "Obtain a signed letter" : "احصل على خطاب موقع";
  }
  if (mode === "ineligible") {
    base.hard_gates[0] = { ...base.hard_gates[0], status: "غير مستوفى", resolution: "غير قابل للإصلاح لهذه الدورة", verdict_basis: "الجهة غير معتمدة صراحة", project_evidence: ["إقرار الجهة صفحة 2"], missing_evidence: [], remediation: "اختر فرصة أخرى" };
  }
  return base;
}

function makeCase(index, mode) {
  const field = FIELDS[index % FIELDS.length];
  const language = LANGUAGES[index % LANGUAGES.length];
  const source_type = SOURCE_TYPES[index % SOURCE_TYPES.length];
  const id = String(index + 1).padStart(2, "0");
  const project = completeProject(id, language, field, source_type);
  const opportunityData = opportunity(id, language, field);
  if (mode === "missing") {
    project.partnerships.existing_partners = [];
    project.partnerships.letters_of_interest = [];
    project.missing_information = [{ field: "partnerships.host_letter", priority: "حرجة", question_to_project_owner: language === "en" ? "Where is the official host letter?" : "أين خطاب الجهة الرسمي؟", why_needed: "شرط أهلية" }];
  }
  if (mode === "weak") {
    project.problem.supporting_evidence = [];
    project.claims_and_evidence = [];
    project.prototype_and_data.test_results = [];
    project.impact.target_metrics = [];
    project.source_summary.extraction_confidence = 25;
    project.source_summary.information_completeness = "منخفضة";
    project.missing_information = [{ field: "evidence", priority: "حرجة", question_to_project_owner: language === "en" ? "Add verifiable evidence" : "أضف أدلة قابلة للتحقق", why_needed: "لا توجد أدلة" }];
  }
  if (mode === "contradictory") {
    project.prototype_and_data.prototype_exists = false;
    project.prototype_and_data.prototype_description = language === "en" ? "Completed prototype" : "نموذج مكتمل";
    project.prototype_and_data.tests_completed = [language === "en" ? "Field test" : "اختبار ميداني"];
  }
  if (mode === "long_weak_extraction") {
    project.source_summary.extraction_confidence = 32;
    project.source_summary.information_completeness = "منخفضة";
    project.source_summary.notes = "مستند طويل مع صفحات مكررة واستخراج ضعيف";
    project.problem.supporting_evidence = [];
    project.claims_and_evidence = [];
    project.missing_information = [{ field: "document.extraction", priority: "حرجة", question_to_project_owner: "أعد رفع نسخة نصية أوضح", why_needed: "ضعف الاستخراج" }];
  }
  const expectedEligibility = mode === "ineligible" ? "غير مؤهل" : ["missing", "weak", "contradictory"].includes(mode) ? "غير محسوم" : mode === "conditional" ? "مؤهل بشروط" : "مؤهل";
  const scoreUnavailable = ["missing", "contradictory", "weak", "long_weak_extraction"].includes(mode);
  return {
    id: `QL-${id}`,
    cohort: mode,
    language,
    field,
    source_profile: { type: source_type, long_document: mode === "long_weak_extraction", weak_extraction: mode === "long_weak_extraction" },
    input: { opportunity: opportunityData, project, model_assessment: modelJudgment(id, mode, language) },
    gold: {
      eligibility: expectedEligibility,
      evidence_locators: mode === "weak" ? [] : ["missing", "contradictory"].includes(mode) ? ["صفحة 3"] : mode === "long_weak_extraction" ? ["صفحة 2"] : ["صفحة 2", "صفحة 3"],
      forbidden_claims: [language === "en" ? "Guaranteed funding" : "تمويل مضمون", language === "en" ? "Patent granted" : "براءة اختراع ممنوحة"],
      missing_keywords: [language === "en" ? "host letter" : "خطاب"].filter(() => ["missing", "weak", "contradictory"].includes(mode)),
      action_keywords: mode === "ineligible"
        ? ["فرصة"]
        : mode === "conditional"
          ? ["خطاب"]
          : ["missing", "weak", "contradictory"].includes(mode)
            ? ["استكمل"]
            : [],
      minimum_contradictions: mode === "contradictory" ? 1 : 0,
      score_unavailable: scoreUnavailable,
      score_band: mode === "complete" ? [60, 100] : mode === "conditional" ? [45, 100] : [0, 100],
    },
  };
}

const MODES = ["complete", "missing", "conditional", "ineligible", "contradictory", "weak", "long_weak_extraction", "complete"];
const QUALITY_FIXTURES = Array.from({ length: 48 }, (_, index) => makeCase(index, MODES[index % MODES.length]));

module.exports = { QUALITY_FIXTURES };
