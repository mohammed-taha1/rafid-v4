"use strict";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function has(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function missingItem(field, question, why, priority) {
  return {
    field,
    question_to_project_owner: question,
    why_needed: why,
    priority,
  };
}

function buildMissingInformation(p) {
  const missing = [];
  const add = (condition, ...args) => {
    if (condition) missing.push(missingItem(...args));
  };

  add(
    !p.project_identity?.university,
    "project_identity.university",
    "ما الجامعة أو الجهة المالكة أو الحاضنة للمشروع؟",
    "لتحديد أهلية التقديم والجهة المسؤولة.",
    "عالية",
  );
  add(
    !p.project_identity?.project_owner?.name,
    "project_identity.project_owner",
    "من صاحب المشروع والمسؤول الرسمي عن التواصل؟",
    "لاستكمال بيانات الملف التمويلي.",
    "عالية",
  );
  add(
    !p.problem?.problem_statement,
    "problem.problem_statement",
    "ما المشكلة المحددة التي يعالجها المشروع؟",
    "لا يمكن تقييم مشروع دون مشكلة واضحة.",
    "حرجة",
  );
  add(
    !p.problem?.problem_scale,
    "problem.problem_scale",
    "ما حجم المشكلة بالأرقام، وما مصدر هذه الأرقام؟",
    "لتقدير أهمية الفرصة وحجم الأثر.",
    "عالية",
  );
  add(
    !p.solution?.solution_summary,
    "solution.solution_summary",
    "ما الحل المقترح بصورة محددة، وكيف يعالج المشكلة؟",
    "لا يمكن تقييم قوة الحل دون وصف واضح.",
    "حرجة",
  );
  add(
    !p.beneficiaries_and_market?.first_target_segment,
    "beneficiaries_and_market.first_target_segment",
    "ما أول فئة أو قطاع سيبدأ به المشروع؟",
    "لمنع تشتت التنفيذ والسوق.",
    "حرجة",
  );
  add(
    !arr(p.beneficiaries_and_market?.market_validation).some((x) => x.evidence_available),
    "beneficiaries_and_market.market_validation",
    "ما التحقق السوقي المنفذ فعليًا، وما دليله؟",
    "لإثبات أن المشكلة والحاجة ليستا افتراضًا فقط.",
    "حرجة",
  );
  add(
    !p.prototype_and_data?.prototype_exists,
    "prototype_and_data.prototype",
    "هل يوجد نموذج أولي أو تجربة؟ وما الذي يعمل فعليًا؟",
    "لتحديد الجاهزية التقنية الحقيقية.",
    "حرجة",
  );
  add(
    !arr(p.prototype_and_data?.test_results).length,
    "prototype_and_data.tests",
    "ما الاختبارات المنفذة ونتائجها بالأرقام؟",
    "لإثبات قوة الحل بدل الاكتفاء بالتصور.",
    "حرجة",
  );
  add(
    !p.prototype_and_data?.data_available,
    "prototype_and_data.data",
    "هل توجد بيانات فعلية؟ صف المصدر والحجم والجودة.",
    "لتقييم قابلية التطبيق والتحقق.",
    "عالية",
  );
  add(
    !p.budget?.requested_amount && !p.budget?.budget_range?.minimum && !p.budget?.budget_range?.maximum,
    "budget",
    "ما المبلغ المطلوب وما تفصيل بنود الصرف؟",
    "لا يمكن تجهيز طلب تمويل دون ميزانية.",
    "حرجة",
  );
  add(
    !arr(p.budget?.budget_items).length,
    "budget.budget_items",
    "ما بنود الميزانية وكمياتها وتكلفتها وأساس تقديرها؟",
    "للتأكد من منطق المبلغ المطلوب.",
    "عالية",
  );
  add(
    !arr(p.funding_request?.funding_needed_for).length,
    "funding_request",
    "ما الذي سيموّل تحديدًا، وما المخرج الناتج؟",
    "لربط المبلغ بخطة تنفيذ واضحة.",
    "حرجة",
  );
  add(
    !arr(p.partnerships?.existing_partners).length,
    "partnerships",
    "هل توجد جهة تطبيق أو شريك أو خطاب اهتمام؟",
    "لرفع قابلية التنفيذ وثقة الممول.",
    "عالية",
  );
  add(
    !p.intellectual_property?.ownership,
    "intellectual_property.ownership",
    "من يملك المشروع والكود والنتائج والملكية الفكرية؟",
    "لتحديد حق التقديم والاستثمار.",
    "حرجة",
  );
  add(
    !arr(p.regulatory_and_ethical?.regulatory_requirements).length,
    "regulatory_and_ethical.regulatory_requirements",
    "ما المتطلبات النظامية أو الأخلاقية أو التراخيص؟",
    "لتجنب تمويل مشروع غير قابل للتطبيق نظاميًا.",
    "عالية",
  );
  add(
    !p.implementation_plan?.duration,
    "implementation_plan.duration",
    "ما مدة التنفيذ ومراحله ومخرجات كل مرحلة؟",
    "لتحويل التمويل إلى خطة قابلة للمتابعة.",
    "عالية",
  );
  add(
    !arr(p.impact?.target_metrics).length,
    "impact.target_metrics",
    "ما مؤشرات النجاح وقيمها المستهدفة وطريقة قياسها؟",
    "لقياس أثر التمويل بصورة قابلة للتحقق.",
    "عالية",
  );

  return missing;
}

function readinessNotes(p) {
  return {
    problem_clarity_notes: p.problem?.problem_statement
      ? "تم استخراج وصف للمشكلة، ويجب مراجعة حجمها وأدلتها."
      : "لم يتم العثور على مشكلة واضحة.",
    solution_strength_notes: p.solution?.solution_summary
      ? "تم استخراج وصف للحل، ويجب مراجعة تميزه واختباراته."
      : "لم يتم العثور على حل واضح.",
    implementation_feasibility_notes:
      p.implementation_plan?.implementation_summary || "لم توجد خطة تنفيذ مفصلة.",
    impact_clarity_notes: arr(p.impact?.expected_impact).length
      ? arr(p.impact.expected_impact).join("؛ ")
      : "لم توجد مؤشرات أثر واضحة.",
    budget_clarity_notes:
      p.budget?.budget_status === "مفصلة"
        ? "الميزانية مذكورة بصورة مفصلة مبدئيًا."
        : p.budget?.requested_amount
          ? "عُثر على مبلغ، لكنه يحتاج مراجعة بنود وأساس التقدير."
          : "لم يُعثر على ميزانية مكتملة.",
    prototype_or_data_readiness_notes: p.prototype_and_data?.prototype_exists
      ? "يوجد ذكر لنموذج أو تجربة، ويجب التحقق من الوظائف والنتائج."
      : "لا يوجد نموذج أولي مثبت في المصدر.",
    market_or_beneficiaries_fit_notes: arr(
      p.beneficiaries_and_market?.primary_beneficiaries,
    ).length
      ? "تم تحديد مستفيدين، ويجب مراجعة التحقق السوقي."
      : "لم تحدد الفئات المستفيدة بوضوح.",
    external_funding_fit_notes: arr(p.funding_request?.funding_needed_for).length
      ? "تم ذكر استخدامات للتمويل وتحتاج مطابقة مع جهة فعلية."
      : "طلب التمويل واستخدامه غير محددين بصورة كافية.",
  };
}

function normalizeProjectData(project, { metadata = {}, files = [] } = {}) {
  const p = structuredClone(project);

  p.project_identity ||= {};
  p.project_identity.project_title =
    metadata.title || p.project_identity.project_title || "مشروع غير مسمى";
  p.project_identity.university =
    metadata.university || p.project_identity.university || null;
  p.project_identity.project_type = arr(p.project_identity.project_type);
  if (metadata.type && !p.project_identity.project_type.includes(metadata.type)) {
    p.project_identity.project_type.unshift(metadata.type);
  }
  p.project_identity.project_owner ||= { name: null, email: null, phone: null };
  p.project_identity.project_owner.name =
    metadata.owner || p.project_identity.project_owner.name || null;

  p.prototype_and_data ||= {};
  p.prototype_and_data.attachments_or_links = [
    ...new Set([
      ...arr(p.prototype_and_data.attachments_or_links),
      ...arr(files).map((f) => f?.name).filter(Boolean),
    ]),
  ];

  p.source_summary ||= {
    sources_reviewed: [],
    information_completeness: "منخفضة",
    extraction_confidence: 0,
    notes: "",
  };
  p.source_summary.sources_reviewed = [
    ...new Set([
      ...arr(p.source_summary.sources_reviewed),
      ...arr(files).map((f) => f?.name).filter(Boolean),
    ]),
  ];
  p.source_summary.extraction_confidence = clamp(
    p.source_summary.extraction_confidence,
    0,
    100,
  );

  p.claims_and_evidence = arr(p.claims_and_evidence);
  p.risks = arr(p.risks);
  p.contradictions = arr(p.contradictions);
  p.assumptions_explicitly_stated_in_source = arr(
    p.assumptions_explicitly_stated_in_source,
  );
  p.funding_readiness_inputs = readinessNotes(p);
  p.missing_information = buildMissingInformation(p);

  return p;
}

function validateProjectData(p) {
  const errors = [];
  const warnings = [];

  if (!p?.project_identity?.project_title) errors.push("اسم المشروع غير موجود.");
  if (!p?.problem?.problem_statement) errors.push("المشكلة غير موجودة.");
  if (!p?.solution?.solution_summary) errors.push("الحل غير موجود.");
  if (!p?.project_identity?.project_owner?.name)
    warnings.push("صاحب المشروع غير محدد.");
  if (!p?.project_identity?.university)
    warnings.push("الجامعة أو الجهة المالكة غير محددة.");
  if (!p?.prototype_and_data?.prototype_exists)
    warnings.push("لا يوجد نموذج أولي مثبت.");
  if (!p?.budget?.requested_amount && !arr(p?.budget?.budget_items).length)
    warnings.push("الميزانية غير مكتملة.");
  if (!arr(p?.funding_request?.funding_needed_for).length)
    warnings.push("استخدام التمويل غير محدد.");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

module.exports = {
  normalizeProjectData,
  validateProjectData,
  buildMissingInformation,
  readinessNotes,
  arr,
  has,
};
