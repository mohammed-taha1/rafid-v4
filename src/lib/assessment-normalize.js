"use strict";

const { arr, clamp, stableId } = require("./opportunity-normalize");
const { applySecondReview, compareAssessmentRounds, evidenceWeight, RUBRIC_VERSION } = require("./assessment-quality");

const ASSESSMENT_VERSION = "rafid.opportunity-match.v1";
const FUNDING_DISCLAIMER =
  "هذا التقييم استرشادي ولا يضمن القبول أو التمويل. المصدر الرسمي وقرار الجهة الممولة هما المرجع النهائي، وقد توجد شروط إضافية للتخصص أو الشريك أو الجاهزية التقنية أو الملكية الفكرية أو التراخيص.";

const STATUS_RANK = {
  "مؤهل": 0,
  "مؤهل بشروط": 1,
  "غير محسوم": 2,
  "غير مؤهل": 3,
};
const GATE_STATUSES = new Set(["مستوفى", "مستوفى جزئيًا", "غير مستوفى", "غير معروف", "لا ينطبق"]);
const REVIEW_RECOMMENDATIONS = new Set(["يوصى بالتقديم", "يوصى بعد استكمال الشروط", "لا يوصى لهذه الدورة", "تحتاج قرارًا مؤسسيًا"]);
const FIT_DIMENSION_WEIGHTS = [
  ["توافق النطاق", 15],
  ["قوة المشكلة", 12],
  ["قوة الحل", 12],
  ["الأدلة والاختبارات", 12],
  ["الفريق والشراكات", 10],
  ["خطة التنفيذ", 10],
  ["الميزانية", 10],
  ["الأثر", 10],
  ["معايير المفاضلة", 9],
];

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
    confidence: 20,
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

function gateResolution(status) {
  if (["مستوفى", "لا ينطبق"].includes(status)) return status === "لا ينطبق" ? "لا يلزم" : "مغلق";
  if (["مستوفى جزئيًا", "غير مستوفى"].includes(status)) return "قابل للإغلاق";
  return "يحتاج تحقق";
}

function expandGate(requirement, gate) {
  if (!gate) return missingGate(requirement);
  const evidence = arr(gate.project_evidence).map((item) =>
    typeof item === "string"
      ? { evidence: item, source: "بيانات المشروع المنظمة", strength: "جزئي" }
      : item,
  );
  const status = GATE_STATUSES.has(gate.status) ? gate.status : "غير معروف";
  const evidenceStrength = evidence.reduce((best, item) => Math.max(best, evidenceWeight(item?.strength)), 0);
  const confidence = status === "غير معروف"
    ? 20
    : status === "لا ينطبق"
      ? 55
      : Math.round(evidenceStrength * 85 + (requirement.source_quote ? 15 : 0));
  return {
    ...missingGate(requirement),
    ...gate,
    requirement_id: requirement.requirement_id,
    requirement: requirement.title || requirement.description || gate.requirement || "شرط غير مسمى",
    status,
    resolution: gate.resolution || gateResolution(status),
    confidence: clamp(confidence),
    project_evidence: evidence,
    missing_evidence: arr(gate.missing_evidence).length
      ? arr(gate.missing_evidence)
      : status === "مستوفى" || status === "لا ينطبق"
        ? []
        : arr(requirement.evidence_required).length
          ? arr(requirement.evidence_required)
          : ["دليل يثبت استيفاء الشرط"],
    remediation: gate.remediation || "استكمل الدليل واربطه بالنص الرسمي للشرط.",
    owner_role: gate.owner_role || "فريق المشروع",
    due_date: gate.due_date || null,
    opportunity_source_quote: requirement.source_quote || gate.opportunity_source_quote || "",
  };
}

function normalizeFitDimensions(dimensions) {
  const byName = new Map();
  for (const dimension of arr(dimensions)) {
    if (!dimension?.dimension || byName.has(dimension.dimension)) continue;
    byName.set(dimension.dimension, dimension);
  }
  return FIT_DIMENSION_WEIGHTS.map(([name, weight]) => {
    const source = byName.get(name) || {};
    return {
      dimension: name,
      score: clamp(source.score),
      weight_percent: weight,
      rationale: String(source.rationale || "لم تتوفر معلومات منظمة كافية لتفسير هذا البعد."),
      evidence: arr(source.evidence).map(String).slice(0, 6),
      improvement: String(source.improvement || "استكمل الأدلة المرتبطة بهذا البعد وراجعها بشريًا."),
    };
  });
}

function gateGap(gate) {
  if (["مستوفى", "لا ينطبق"].includes(gate.status)) return null;
  return {
    gap_id: stableId("gap", gate.requirement_id, gate.status),
    severity: gate.status === "غير مستوفى" ? "مانع" : "حرج",
    related_requirement_id: gate.requirement_id,
    title: `إغلاق شرط: ${gate.requirement}`,
    current_state: gate.verdict_basis || "لا يتوفر دليل كافٍ للحسم.",
    required_action: gate.remediation || "استكمل الدليل واربطه بالشرط الرسمي.",
    evidence_to_produce: arr(gate.missing_evidence),
    owner_role: gate.owner_role || "فريق المشروع",
    due_date: gate.due_date || null,
    completion_criterion: "اعتماد دليل صريح مقابل نص الشرط من مراجع بشري.",
    status: "مفتوحة",
  };
}

function projectInformationGap(missing, index) {
  return {
    gap_id: stableId("gap", missing.field, index),
    severity: missing.priority === "حرجة" ? "حرج" : "مهم",
    related_requirement_id: "project-information",
    title: missing.field || "معلومة مشروع ناقصة",
    current_state: "غير موضح في مادة المشروع المتاحة.",
    required_action: missing.question_to_project_owner || "استكمل المعلومة وارفق دليلها.",
    evidence_to_produce: [missing.why_needed || "معلومة موثقة قابلة للمراجعة"],
    owner_role: "فريق المشروع",
    due_date: null,
    completion_criterion: "إضافة إجابة صريحة ودليل يمكن للمراجع التحقق منه.",
    status: "مفتوحة",
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

function present(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(present);
  return true;
}

function fallbackAssessmentData({ opportunity, project } = {}) {
  const dimensions = [
    ["توافق النطاق", 15, present(opportunity?.purpose_and_scope?.objectives) && present(project?.project_identity?.project_type), "تحتاج مطابقة النطاق والتخصص يدويًا مع النص الرسمي."],
    ["قوة المشكلة", 12, present(project?.problem?.problem_statement), "أضف تعريفًا محددًا للمشكلة وحجمها ودليلها."],
    ["قوة الحل", 12, present(project?.solution?.solution_summary), "وضح الحل المقترح وتميزه وصلته المباشرة بالمشكلة."],
    ["الأدلة والاختبارات", 12, present(project?.prototype_and_data?.test_results) || present(project?.claims_and_evidence), "أرفق نتائج اختبار قابلة للتحقق ومصادر الأدلة."],
    ["الفريق والشراكات", 10, present(project?.team) || present(project?.partnerships?.existing_partners), "حدد أدوار الفريق والشركاء وخطابات الالتزام المتاحة."],
    ["خطة التنفيذ", 10, present(project?.implementation_plan?.duration) || present(project?.implementation_plan?.implementation_summary), "حوّل العمل إلى مراحل ومخرجات ومسؤوليات وجدول زمني."],
    ["الميزانية", 10, present(project?.budget?.requested_amount) || present(project?.budget?.budget_items), "جهز ميزانية مفصلة ومبررة ومتوافقة مع بنود الفرصة."],
    ["الأثر", 10, present(project?.impact?.expected_impact) || present(project?.impact?.target_metrics), "حدد أثرًا قابلًا للقياس ومستفيدين ومؤشرات نجاح."],
    ["معايير المفاضلة", 9, present(opportunity?.evaluation_criteria) && present(project?.claims_and_evidence), "اربط كل معيار مفاضلة بدليل صريح من المشروع."],
  ].map(([dimension, weight_percent, available, improvement]) => ({
    dimension,
    score: available ? 55 : 20,
    weight_percent,
    rationale: available
      ? "توجد معلومة أولية في بيانات المشروع، لكن تعذر التحقق الآلي الكامل منها ويلزم فحص بشري."
      : "لم تتوفر معلومة منظمة كافية للحكم، لذلك لم يفترض رافد استيفاء هذا البعد.",
    evidence: [],
    improvement,
  }));

  const readinessScore = Math.round(
    dimensions.reduce((total, item) => total + item.score * item.weight_percent, 0) / 100,
  );
  const sourceConfidence = clamp(project?.source_summary?.extraction_confidence || 0);
  const evidenceStrength = Math.min(45, Math.round(sourceConfidence * 0.45));

  const requirementGaps = mandatoryHardRequirements(opportunity).map((requirement) => ({
    gap_id: stableId("gap", requirement.requirement_id, "manual-verification"),
    severity: "حرج",
    related_requirement_id: requirement.requirement_id,
    title: `التحقق من شرط: ${requirement.title || requirement.description || "شرط إلزامي"}`,
    current_state: "غير محسوم لعدم توفر حكم آلي موثوق.",
    required_action: "راجع الشرط في المصدر الرسمي واربطه بدليل صريح من المشروع.",
    evidence_to_produce: arr(requirement.evidence_required).length
      ? arr(requirement.evidence_required)
      : ["دليل موثق على استيفاء الشرط"],
    owner_role: "فريق المشروع",
    due_date: null,
    completion_criterion: "اعتماد مراجع بشري للدليل مقابل النص الرسمي للشرط.",
    status: "مفتوحة",
  }));

  const informationGaps = arr(project?.missing_information).slice(0, 6).map((missing, index) => ({
    gap_id: stableId("gap", missing.field, index),
    severity: missing.priority === "حرجة" ? "حرج" : "مهم",
    related_requirement_id: "project-information",
    title: missing.field || "معلومة مشروع ناقصة",
    current_state: "غير موضح في مادة المشروع المتاحة.",
    required_action: missing.question_to_project_owner || "استكمل المعلومة وارفق دليلها.",
    evidence_to_produce: [missing.why_needed || "معلومة موثقة قابلة للمراجعة"],
    owner_role: "فريق المشروع",
    due_date: null,
    completion_criterion: "إضافة إجابة صريحة ودليل يمكن للمراجع التحقق منه.",
    status: "مفتوحة",
  }));
  const gaps = [...requirementGaps, ...informationGaps];
  const actionPlan = gaps.slice(0, 8).map((gap, index) => ({
    action_id: stableId("act", gap.gap_id),
    priority: index + 1,
    action: gap.required_action,
    why_now: gap.severity === "حرج" ? "لأنها فجوة حرجة قبل قرار التقديم." : "لرفع جودة ووضوح ملف التقديم.",
    owner_role: gap.owner_role,
    due_date: null,
    dependency: null,
    output: gap.completion_criterion,
    related_gap_ids: [gap.gap_id],
  }));

  return {
    hard_gates: [],
    fit_dimensions: dimensions,
    readiness: {
      opportunity_readiness_score: readinessScore,
      evidence_strength_score: evidenceStrength,
      assessment_confidence: 35,
      summary: "تعذر التحقق من مخرجات التقييم الآلي، لذلك يعرض رافد قراءة محافظة مبنية فقط على اكتمال البيانات المنظمة. جميع شروط الأهلية تحتاج مراجعة بشرية.",
    },
    gaps,
    action_plan: actionPlan,
    application_package: arr(opportunity?.submission_documents).map((document) => ({
      document_id: document.document_id,
      document_name: document.name || "وثيقة مطلوبة",
      mandatory: Boolean(document.mandatory),
      status: "غير معروف",
      available_evidence: "لم يتم التحقق آليًا من توفر الوثيقة.",
      missing_content: document.description ? [document.description] : [],
      next_action: "تحقق من توفر الوثيقة واكتمالها وفق المصدر الرسمي.",
      owner_role: "فريق المشروع",
    })),
    institutional_review: {
      recommendation: "تحتاج قرارًا مؤسسيًا",
      rationale: "المسار الاحتياطي لا يصدر توصية تقديم نهائية؛ يلزم التحقق البشري من الأهلية والأدلة.",
      questions_for_project_team: arr(project?.missing_information)
        .slice(0, 8)
        .map((item) => item.question_to_project_owner)
        .filter(Boolean),
      questions_for_funder: arr(opportunity?.missing_information)
        .slice(0, 8)
        .map((item) => item.question_for_funder)
        .filter(Boolean),
      reviewer_attention_points: [
        "تحقق يدويًا من كل بوابة أهلية صارمة.",
        "لا تعتمد على الدرجات وحدها قبل مراجعة الأدلة والمصدر الرسمي.",
      ],
      institutional_review_required: true,
    },
    risk_disclosures: [
      "استُخدم مسار احتياطي محافظ بعد تعذر مطابقة مخرجات المزود للبنية المطلوبة.",
      "الدرجات لا تثبت الأهلية أو القبول ولا تستبدل قرار الجهة الممولة.",
    ],
  };
}

function normalizeAssessmentData(assessment, { opportunity, project, previousAssessment = null } = {}) {
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
    (requirement) => expandGate(requirement, gatesByRequirement.get(requirement.requirement_id)),
  );

  item.fit_dimensions = normalizeFitDimensions(item.fit_dimensions);
  item.readiness ||= {};
  item.readiness.opportunity_readiness_score = Math.round(
    item.fit_dimensions.reduce(
      (total, dimension) => total + dimension.score * dimension.weight_percent,
      0,
    ) / 100,
  );
  item.readiness.evidence_strength_score = clamp(item.readiness.evidence_strength_score);
  item.readiness.assessment_confidence = clamp(item.readiness.assessment_confidence);
  item.readiness.summary = String(item.readiness.summary || "");

  // تمر نتيجة النموذج بمراجع ثانٍ حتمي قبل اشتقاق الأهلية والفجوات.
  // يحظر هذا المسار اعتماد شرط بلا دليل ويستبدل درجات النموذج بروبريك ثابت.
  applySecondReview(item, { opportunity, project });

  const generatedGaps = [
    ...item.hard_gates.map(gateGap).filter(Boolean),
    ...arr(project?.missing_information).slice(0, 6).map(projectInformationGap),
  ];
  item.gaps = (arr(item.gaps).length ? arr(item.gaps) : generatedGaps).map((gap, index) => ({
    ...gap,
    gap_id:
      gap.gap_id ||
      stableId("gap", item.assessment_id, gap.title, gap.related_requirement_id, index),
  }));
  const generatedActions = item.gaps.slice(0, 8).map((gap, index) => ({
    action: gap.required_action,
    priority: index + 1,
    why_now: gap.severity === "مانع" || gap.severity === "حرج"
      ? "لأنها فجوة تؤثر مباشرة في قرار الأهلية أو التقديم."
      : "لرفع جودة ملف التقديم وقابلية مراجعته.",
    owner_role: gap.owner_role || "فريق المشروع",
    due_date: gap.due_date || null,
    dependency: null,
    output: gap.completion_criterion,
    related_gap_ids: [gap.gap_id],
  }));
  item.action_plan = (arr(item.action_plan).length ? arr(item.action_plan) : generatedActions)
    .map((action, index) => ({
      ...action,
      action_id: action.action_id || stableId("act", item.assessment_id, action.action, index),
      priority: Math.max(1, Math.round(Number(action.priority) || index + 1)),
      related_gap_ids: arr(action.related_gap_ids),
    }))
    .sort((a, b) => a.priority - b.priority);
  item.application_package = arr(item.application_package).length
    ? arr(item.application_package)
    : arr(opportunity?.submission_documents).map((document) => ({
        document_id: document.document_id,
        document_name: document.name || "وثيقة مطلوبة",
        mandatory: Boolean(document.mandatory),
        status: "غير معروف",
        available_evidence: "لم يتم التحقق من توفر الوثيقة ضمن المادة الحالية.",
        missing_content: document.description ? [document.description] : [],
        next_action: "تحقق من اكتمال الوثيقة وفق المصدر الرسمي.",
        owner_role: "فريق المشروع",
      }));
  item.risk_disclosures = arr(item.risk_disclosures);
  item.institutional_review ||= {};
  item.institutional_review.recommendation = REVIEW_RECOMMENDATIONS.has(
    item.institutional_review.recommendation,
  )
    ? item.institutional_review.recommendation
    : "تحتاج قرارًا مؤسسيًا";
  item.institutional_review.rationale = String(
    item.institutional_review.rationale || "يلزم اعتماد النتيجة من مراجع بشري.",
  );
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

  const recommendationByDecision =
    item.eligibility.status === "غير مؤهل"
      ? "لا يوصى لهذه الدورة"
      : item.eligibility.status === "غير محسوم"
        ? "تحتاج قرارًا مؤسسيًا"
        : item.eligibility.status === "مؤهل بشروط" || blockingGaps
          ? "يوصى بعد استكمال الشروط"
          : item.readiness.opportunity_readiness_score >= 65
            ? "يوصى بالتقديم"
            : "يوصى بعد استكمال الشروط";
  if (item.institutional_review.recommendation !== recommendationByDecision) {
    item.quality_review.corrections.push(
      `وُحّدت توصية المراجعة مع الأهلية والفجوات: ${recommendationByDecision}.`,
    );
    item.quality_review.corrections_count += 1;
    item.institutional_review.recommendation = recommendationByDecision;
  }
  item.readiness.summary = `${item.eligibility.reason} الدرجة ${item.readiness.opportunity_readiness_score} من 100 حُسبت بروبريك ثابت، وقوة الأدلة ${item.readiness.evidence_strength_score} من 100.`;
  if (!item.readiness.score_available) {
    const range = item.readiness.score_range;
    item.readiness.summary = `${item.eligibility.reason} البيانات الحالية لا تكفي لعرض درجة دقيقة وفق روبريك ثابت${range ? `؛ النطاق الاسترشادي ${range.minimum}–${range.maximum}` : ""}. قوة الأدلة ${item.readiness.evidence_strength_score} من 100.`;
  }
  item.round_comparison = compareAssessmentRounds(previousAssessment, item);

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
  if (assessment?.quality_review?.rubric_version !== RUBRIC_VERSION)
    errors.push("لم تمر النتيجة بمحرك التقييم الحتمي والمراجع الثاني.");
  if (assessment?.readiness?.score_available === false && assessment?.readiness?.opportunity_readiness_score !== null)
    errors.push("لا يجوز عرض درجة دقيقة عندما تكون بيانات التقييم غير كافية.");
  if (assessment?.readiness?.score_available === true && !Number.isFinite(Number(assessment?.readiness?.opportunity_readiness_score)))
    errors.push("درجة الجاهزية المطلوبة غير موجودة رغم كفاية البيانات.");
  for (const dimension of arr(assessment?.fit_dimensions)) {
    if (!Number.isFinite(Number(dimension.confidence)) || dimension.confidence < 0 || dimension.confidence > 100)
      errors.push(`ثقة بُعد «${dimension.dimension || "غير مسمى"}» غير صالحة.`);
    if (!arr(dimension.evidence).length)
      errors.push(`بُعد «${dimension.dimension || "غير مسمى"}» لا يصرح بالدليل أو غيابه.`);
    if (dimension.score_available === false && dimension.score !== null)
      errors.push(`بُعد «${dimension.dimension || "غير مسمى"}» يعرض درجة دقيقة دون أدلة كافية.`);
  }
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
  const aReadiness = a?.assessment?.readiness || {};
  const bReadiness = b?.assessment?.readiness || {};
  if (Boolean(aReadiness.score_available) !== Boolean(bReadiness.score_available)) {
    return bReadiness.score_available ? 1 : -1;
  }
  if (aReadiness.score_available) {
    const scoreDelta = Number(bReadiness.opportunity_readiness_score) - Number(aReadiness.opportunity_readiness_score);
    if (scoreDelta) return scoreDelta;
  }
  const evidenceDelta = clamp(bReadiness.evidence_strength_score || 0) - clamp(aReadiness.evidence_strength_score || 0);
  if (evidenceDelta) return evidenceDelta;
  const confidenceDelta = clamp(bReadiness.assessment_confidence || 0) - clamp(aReadiness.assessment_confidence || 0);
  if (confidenceDelta) return confidenceDelta;
  return arr(a?.assessment?.gaps).length - arr(b?.assessment?.gaps).length;
}

module.exports = {
  ASSESSMENT_VERSION,
  FUNDING_DISCLAIMER,
  STATUS_RANK,
  mandatoryHardRequirements,
  deriveEligibility,
  fallbackAssessmentData,
  normalizeAssessmentData,
  validateAssessmentData,
  portfolioSort,
  compareAssessmentRounds,
};
