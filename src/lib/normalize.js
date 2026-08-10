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

function labeledSections(rawText) {
  const sections = new Map();
  const prepared = String(rawText || "").replace(
    /\s+(?=(?:الأثر المتوقع|الأثر الاقتصادي|الأثر الاجتماعي|المعلومات غير الموضحة|خطة التنفيذ|النتائج الأولية|المنهجية|الميزانية|المخاطر|الفريق|المستفيدون)\s*:)/g,
    "\n",
  );
  for (const line of prepared.split(/\r?\n/)) {
    const match = line.trim().match(/^([^:：]{2,45})[:：]\s*(.+)$/);
    if (!match) continue;
    const label = match[1].replace(/[ـ\s]+/g, " ").trim();
    const value = match[2].trim();
    if (value.length >= 8) sections.set(label, value);
  }
  return sections;
}

function sectionValue(sections, patterns) {
  for (const [label, value] of sections) {
    if (patterns.some((pattern) => pattern.test(label))) return value;
  }
  return "";
}

function splitArabicList(value) {
  return String(value || "")
    .split(/[،؛]|\s+و(?=[\p{L}])/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
    .slice(0, 12);
}

function augmentProjectDataFromText(project, rawText) {
  const p = structuredClone(project || {});
  const sections = labeledSections(rawText);
  const problem = sectionValue(sections, [/المشكلة/, /التحدي/]);
  const objective = sectionValue(sections, [/الهدف/, /الأهداف/]);
  const methodology = sectionValue(sections, [/المنهجية/, /طريقة العمل/, /النهج/]);
  const results = sectionValue(sections, [/النتائج/, /الاختبارات/, /الدليل الأولي/]);
  const innovation = sectionValue(sections, [/الابتكار/, /التميز/]);
  const beneficiaries = sectionValue(sections, [/المستفيد/, /الفئة المستهدفة/]);
  const impact = sectionValue(sections, [/الأثر/]);
  const plan = sectionValue(sections, [/خطة التنفيذ/, /الجدول الزمني/]);
  const team = sectionValue(sections, [/الفريق/]);
  const risks = sectionValue(sections, [/المخاطر/]);
  const budget = sectionValue(sections, [/الميزانية/]);

  p.problem ||= {};
  if (!presentText(p.problem.problem_statement) && problem) p.problem.problem_statement = problem;
  p.solution ||= {};
  if (!presentText(p.solution.solution_summary) && objective) p.solution.solution_summary = objective;
  if (!presentText(p.solution.how_it_works) && methodology) p.solution.how_it_works = methodology;
  if (!arr(p.solution.innovation_or_differentiation).length && innovation)
    p.solution.innovation_or_differentiation = [innovation];
  p.beneficiaries_and_market ||= {};
  if (!arr(p.beneficiaries_and_market.primary_beneficiaries).length && beneficiaries)
    p.beneficiaries_and_market.primary_beneficiaries = splitArabicList(beneficiaries);
  p.prototype_and_data ||= {};
  if (results) {
    if (!arr(p.prototype_and_data.test_results).length) p.prototype_and_data.test_results = [results];
    if (!arr(p.prototype_and_data.tests_completed).length) p.prototype_and_data.tests_completed = ["اختبار أو نتيجة أولية مذكورة في المصدر"];
    if (/اختبار|نموذج|تجرب/.test(results)) p.prototype_and_data.prototype_exists = true;
  }
  p.impact ||= {};
  if (!arr(p.impact.expected_impact).length && impact) p.impact.expected_impact = [impact];
  p.implementation_plan ||= {};
  if (!presentText(p.implementation_plan.implementation_summary) && (plan || methodology))
    p.implementation_plan.implementation_summary = plan || methodology;
  if (!presentText(p.implementation_plan.duration) && plan) {
    const durations = [...plan.matchAll(/\d+\s*(?:شهر|أشهر|أسبوع|أسابيع|سنة|سنوات)/g)].map((match) => match[0]);
    if (durations.length) p.implementation_plan.duration = durations.join(" + ");
  }
  p.project_identity ||= {};
  if (!arr(p.project_identity.team_members).length && team) {
    p.project_identity.team_members = splitArabicList(team).map((role) => ({
      name: "غير مذكور",
      role,
      specialization: role,
      relevant_experience: "غير موضح في المصدر",
    }));
  }
  if (!arr(p.risks).length && risks) {
    p.risks = splitArabicList(risks).map((risk) => ({
      risk,
      type: "تشغيلي",
      existing_mitigation: "راجع الإجراء المذكور في المصدر واربطه بكل خطر.",
      source_in_project_information: "قسم المخاطر",
    }));
  }
  p.budget ||= {};
  if (budget && (!p.budget.budget_status || p.budget.budget_status === "غير موجودة")) {
    p.budget.budget_status = "تقديرية";
    p.budget.budget_assumptions = arr(p.budget.budget_assumptions).length ? p.budget.budget_assumptions : [budget];
  }
  p.claims_and_evidence = arr(p.claims_and_evidence);
  if (results && !p.claims_and_evidence.some((claim) => claim.claim === results)) {
    p.claims_and_evidence.push({
      claim: results,
      claim_type: "بحثي",
      evidence_status: "مثبت جزئيًا",
      available_evidence: results,
      evidence_source: "قسم النتائج أو الاختبارات في المصدر",
      additional_evidence_needed: "أرفق الأرقام وحجم العينة ومنهج الاختبار والمرجع أو الصفحة.",
    });
  }
  return p;
}

function presentText(value) {
  return typeof value === "string" && value.trim().length >= 3;
}

function validateProjectData(p) {
  const errors = [];
  const warnings = [];

  if (!p?.project_identity?.project_title) errors.push("اسم المشروع غير موجود.");
  // البحث غير المكتمل مدخل صالح للتحليل؛ الغياب يجب أن يظهر كفجوة لا كتعطل تقني.
  if (!p?.problem?.problem_statement) warnings.push("المشكلة غير موضحة في البحث.");
  if (!p?.solution?.solution_summary) warnings.push("الحل أو النهج التطبيقي غير موضح في البحث.");
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

function fallbackProjectData(rawText, { metadata = {}, files = [] } = {}) {
  const sourceText = String(rawText || "").trim();
  return normalizeProjectData(
    augmentProjectDataFromText({
      project_identity: {
        project_title: metadata.title || "بحث أو مشروع المستخدم",
        university: metadata.university || null,
        project_type: metadata.type ? [metadata.type] : [],
        project_owner: { name: null, email: null, phone: null },
      },
      project_stage: { current_stage: "غير محدد" },
      source_summary: {
        sources_reviewed: files.map((file) => file?.name).filter(Boolean),
        information_completeness: "منخفضة",
        extraction_confidence: 25,
        notes: `تعذر تنظيم الاستخراج الأولي آليًا. يعاد تمرير النص المصدر كما هو إلى مرحلة المطابقة دون اختلاق حقول:\n${sourceText}`,
      },
      prototype_and_data: {
        prototype_exists: false,
        attachments_or_links: [],
      },
      claims_and_evidence: [],
      risks: [],
      contradictions: [],
      assumptions_explicitly_stated_in_source: [],
    }, sourceText),
    { metadata, files },
  );
}

module.exports = {
  normalizeProjectData,
  augmentProjectDataFromText,
  fallbackProjectData,
  validateProjectData,
  buildMissingInformation,
  readinessNotes,
  arr,
  has,
};
