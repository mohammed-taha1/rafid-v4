"use strict";

const crypto = require("node:crypto");

const REQUIREMENT_CATEGORIES = Object.freeze([
  "أهلية مقدم الطلب",
  "نطاق المشروع",
  "مرحلة الجاهزية",
  "الفريق والشركاء",
  "الميزانية والتمويل المشترك",
  "المدة والجدول الزمني",
  "الأخلاقيات والتنظيم",
  "الملكية الفكرية",
  "الوثائق والتقديم",
  "معيار تقييم",
  "أخرى",
]);

const REQUIREMENT_CATEGORY_SET = new Set(REQUIREMENT_CATEGORIES);
const OPPORTUNITY_STATUSES = new Set(["مفتوحة", "قادمة", "مغلقة", "غير معروف"]);
const REQUIREMENT_TYPES = new Set(["إلزامي", "مفضل", "معلومة إرشادية"]);
const GATE_TYPES = new Set(["بوابة صارمة", "عامل مفاضلة", "ليس بوابة"]);
const COMPLETENESS_LEVELS = new Set(["مرتفعة", "متوسطة", "منخفضة"]);
const MISSING_IMPACTS = new Set(["يمنع تحديد الأهلية", "يؤثر في الجاهزية", "تحسين فقط"]);

const CATEGORY_ALIASES = Object.freeze({
  "الأهلية": "أهلية مقدم الطلب",
  "أهلية المتقدم": "أهلية مقدم الطلب",
  "أهلية الجهة المتقدمة": "أهلية مقدم الطلب",
  "نوع مقدم الطلب": "أهلية مقدم الطلب",
  "نوع المتقدم": "أهلية مقدم الطلب",
  "شروط المتقدم": "أهلية مقدم الطلب",
  "الجنسية والموقع": "أهلية مقدم الطلب",

  "النطاق": "نطاق المشروع",
  "نطاق الفرصة": "نطاق المشروع",
  "نطاق البرنامج": "نطاق المشروع",
  "مجال المشروع": "نطاق المشروع",
  "القطاعات والمجالات": "نطاق المشروع",
  "الأهداف والأولويات": "نطاق المشروع",
  "الأثر البيئي": "نطاق المشروع",
  "الاستدامة": "نطاق المشروع",

  "مرحلة الشركة": "مرحلة الجاهزية",
  "مرحلة المشروع": "مرحلة الجاهزية",
  "النضج التقني": "مرحلة الجاهزية",
  "مستوى الجاهزية التقنية": "مرحلة الجاهزية",
  "TRL": "مرحلة الجاهزية",

  "الفريق": "الفريق والشركاء",
  "الشركاء": "الفريق والشركاء",
  "الشراكات": "الفريق والشركاء",
  "الائتلاف": "الفريق والشركاء",
  "الكونسورتيوم": "الفريق والشركاء",

  "الميزانية": "الميزانية والتمويل المشترك",
  "التمويل": "الميزانية والتمويل المشترك",
  "التمويل المشترك": "الميزانية والتمويل المشترك",
  "المساهمة الذاتية": "الميزانية والتمويل المشترك",
  "التكاليف المؤهلة": "الميزانية والتمويل المشترك",
  "التكاليف غير المؤهلة": "الميزانية والتمويل المشترك",

  "المدة": "المدة والجدول الزمني",
  "الجدول الزمني": "المدة والجدول الزمني",
  "المواعيد": "المدة والجدول الزمني",
  "موعد التقديم": "المدة والجدول الزمني",

  "الأخلاقيات": "الأخلاقيات والتنظيم",
  "الامتثال": "الأخلاقيات والتنظيم",
  "التنظيم": "الأخلاقيات والتنظيم",
  "الموافقات التنظيمية": "الأخلاقيات والتنظيم",
  "التصاريح": "الأخلاقيات والتنظيم",

  "حقوق الملكية الفكرية": "الملكية الفكرية",
  "البراءات": "الملكية الفكرية",
  "حقوق النشر والاستغلال": "الملكية الفكرية",

  "الوثائق": "الوثائق والتقديم",
  "المستندات": "الوثائق والتقديم",
  "وثائق التقديم": "الوثائق والتقديم",
  "آلية التقديم": "الوثائق والتقديم",
  "عملية التقديم": "الوثائق والتقديم",
  "متطلبات التقديم": "الوثائق والتقديم",

  "التقييم": "معيار تقييم",
  "معايير التقييم": "معيار تقييم",
  "معيار التقييم": "معيار تقييم",
  "المفاضلة": "معيار تقييم",
  "الأثر": "معيار تقييم",
});

function cleanCategory(value) {
  return String(value || "")
    .replace(/[ـ]/g, "")
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/^[\s:،؛.\-–—]+|[\s:،؛.\-–—]+$/g, "")
    .trim();
}

function normalizeRequirementCategory(value) {
  const category = cleanCategory(value);
  if (REQUIREMENT_CATEGORY_SET.has(category)) return category;
  if (CATEGORY_ALIASES[category]) return CATEGORY_ALIASES[category];

  if (/أهل|متقدم|مقدم الطلب|جنسية|إقامة|موقع الجهة|نوع الجهة/.test(category)) {
    return "أهلية مقدم الطلب";
  }
  if (/نطاق|مجال|قطاع|أولوية|هدف|نشاط|موضوع|مناخ|بيئ|استدام/.test(category)) {
    return "نطاق المشروع";
  }
  if (/مرحلة|جاهزية|نضج|TRL|تقني/.test(category)) {
    return "مرحلة الجاهزية";
  }
  if (/فريق|شريك|شراكة|ائتلاف|كونسورتيوم|تعاون/.test(category)) {
    return "الفريق والشركاء";
  }
  if (/ميزانية|تمويل|تكلفة|مساهمة|دعم مالي|نسبة التمويل/.test(category)) {
    return "الميزانية والتمويل المشترك";
  }
  if (/مدة|جدول زمني|موعد|تاريخ|إغلاق|فترة التنفيذ/.test(category)) {
    return "المدة والجدول الزمني";
  }
  if (/أخلاق|تنظيم|امتثال|تصريح|موافقة|سلامة|قانون/.test(category)) {
    return "الأخلاقيات والتنظيم";
  }
  if (/ملكية فكرية|براءة|حقوق نشر|حقوق استغلال|IP/.test(category)) {
    return "الملكية الفكرية";
  }
  if (/وثيق|مستند|تقديم|طلب|نموذج|مرفق|بوابة إلكترونية/.test(category)) {
    return "الوثائق والتقديم";
  }
  if (/تقييم|مفاضلة|درجة|وزن|نقاط|أثر/.test(category)) {
    return "معيار تقييم";
  }
  return "أخرى";
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function stableId(prefix, ...parts) {
  const source = parts.map((part) => String(part || "").trim()).join("|");
  return `${prefix}-${crypto.createHash("sha256").update(source || crypto.randomUUID()).digest("hex").slice(0, 12)}`;
}

function normalizeOpportunityData(opportunity, { metadata = {} } = {}) {
  const item = structuredClone(opportunity || {});
  item.identity ||= {};
  item.identity.title = metadata.title || item.identity.title || "فرصة غير مسماة";
  item.identity.funder = metadata.funder || item.identity.funder || null;
  item.identity.official_source_url =
    metadata.official_source_url || item.identity.official_source_url || null;
  item.identity.deadline = metadata.deadline || item.identity.deadline || null;
  item.identity.status = OPPORTUNITY_STATUSES.has(item.identity.status)
    ? item.identity.status
    : "غير معروف";
  item.identity.opportunity_id =
    item.identity.opportunity_id ||
    stableId(
      "opp",
      item.identity.title,
      item.identity.funder,
      item.identity.deadline,
      item.identity.official_source_url,
    );

  const seenIds = new Set();
  item.requirements = arr(item.requirements).map((requirement, index) => {
    const normalized = { ...requirement };
    let id = String(normalized.requirement_id || "").trim();
    if (!id || seenIds.has(id)) {
      id = stableId(
        "req",
        item.identity.opportunity_id,
        normalized.title,
        normalized.source_quote,
        index,
      );
    }
    seenIds.add(id);
    normalized.requirement_id = id;
    normalized.category = normalizeRequirementCategory(normalized.category);
    normalized.requirement_type = REQUIREMENT_TYPES.has(normalized.requirement_type)
      ? normalized.requirement_type
      : "معلومة إرشادية";
    normalized.gate_type = GATE_TYPES.has(normalized.gate_type)
      ? normalized.gate_type
      : "ليس بوابة";
    normalized.evidence_required = arr(normalized.evidence_required);
    return normalized;
  });

  const seenDocs = new Set();
  item.submission_documents = arr(item.submission_documents).map((document, index) => {
    const normalized = { ...document };
    let id = String(normalized.document_id || "").trim();
    if (!id || seenDocs.has(id)) {
      id = stableId("doc", item.identity.opportunity_id, normalized.name, index);
    }
    seenDocs.add(id);
    normalized.document_id = id;
    return normalized;
  });

  item.evaluation_criteria = arr(item.evaluation_criteria);
  item.contradictions = arr(item.contradictions);
  item.missing_information = arr(item.missing_information).map((missing) => ({
    ...missing,
    impact: MISSING_IMPACTS.has(missing?.impact) ? missing.impact : "تحسين فقط",
  }));
  item.source_summary ||= {};
  item.source_summary.source_name =
    metadata.source_name || item.source_summary.source_name || "نص الفرصة المرفق";
  item.source_summary.sections_reviewed = arr(item.source_summary.sections_reviewed);
  item.source_summary.extraction_confidence = clamp(
    item.source_summary.extraction_confidence,
  );
  item.source_summary.information_completeness = COMPLETENESS_LEVELS.has(
    item.source_summary.information_completeness,
  )
    ? item.source_summary.information_completeness
    : "منخفضة";

  return item;
}

function validateOpportunityData(opportunity) {
  const errors = [];
  const warnings = [];
  if (!opportunity?.identity?.title) errors.push("اسم الفرصة غير موجود.");
  if (!arr(opportunity?.requirements).length)
    errors.push("لم يتم استخراج أي شرط من مصدر الفرصة.");
  if (!arr(opportunity?.requirements).some((item) => item.gate_type === "بوابة صارمة"))
    warnings.push("لم يتم تمييز أي بوابة أهلية صارمة؛ راجع المصدر يدويًا.");
  if (!opportunity?.identity?.deadline)
    warnings.push("موعد الإغلاق غير معروف.");
  if (!opportunity?.identity?.official_source_url)
    warnings.push("الرابط الرسمي غير مثبت.");
  if (arr(opportunity?.contradictions).length)
    warnings.push("يتضمن المصدر تعارضات تحتاج حسمًا من الجهة الممولة.");

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  arr,
  clamp,
  stableId,
  REQUIREMENT_CATEGORIES,
  normalizeRequirementCategory,
  normalizeOpportunityData,
  validateOpportunityData,
};
