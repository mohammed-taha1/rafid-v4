"use strict";

// هذا الكتالوج دليل أولي قابل للمراجعة، وليس إعلانًا بأن باب التقديم مفتوح.
// لا تُضاف فرصة بلا مصدر رسمي وتاريخ تحقق واضح.
const CATALOG_VERSION = "rafid.funding-catalog.v2.2026-08-18";
const VERIFIED_AT = "2026-08-10";
const RDIA_FUNDING_URL = "https://www.rdia.gov.sa/programs/funding/";
const RDIA_FAQ_URL = "https://npst.ksu.edu.sa/sites/npst.ksu.edu.sa/files/attach/RDIA%20Research%20Grants%20FAQ%202nd%20Call.pdf";

function rdiaProgram(id, title, summary, options = {}) {
  return {
    opportunity_id: id,
    title,
    funder: "هيئة تنمية البحث والتطوير والابتكار",
    program_family: "منح البحث والتطوير والابتكار",
    summary,
    official_url: RDIA_FUNDING_URL,
    supporting_source_url: RDIA_FAQ_URL,
    source_kind: "مصدر حكومي رسمي ودليل أسئلة شائعة للبرامج",
    last_verified_at: VERIFIED_AT,
    application_status: "verify_official_source",
    deadline: null,
    country_or_region: "المملكة العربية السعودية",
    eligible_countries: ["المملكة العربية السعودية"],
    eligible_disciplines: options.priority_areas || [
      "الصحة والعافية",
      "استدامة البيئة والاحتياجات الأساسية",
      "الطاقة والصناعة",
      "اقتصاديات المستقبل",
    ],
    priority_areas: options.priority_areas || [
      "الصحة والعافية",
      "استدامة البيئة والاحتياجات الأساسية",
      "الطاقة والصناعة",
      "اقتصاديات المستقبل",
    ],
    keywords: options.keywords || [],
    target_project_types: options.target_project_types || ["بحث", "ابتكار"],
    min_trl: options.min_trl ?? null,
    max_trl: options.max_trl ?? null,
    applicant_types: options.applicant_types || ["باحث", "جامعة", "مركز بحثي"],
    funding_amount: null,
    currency: "ريال سعودي",
    funding_ceiling: {
      amount: null,
      currency: "SAR",
      status: "not_verified_for_current_call",
    },
    partner_requirement: options.partner_requirement || {
      required: null,
      type: null,
      status: "verify_current_call",
    },
    readiness_requirement: {
      min_trl: options.min_trl ?? null,
      max_trl: options.max_trl ?? null,
      status: "guidance_only_until_current_call_is_verified",
    },
    ip_and_licensing: {
      ownership_required: null,
      licences_required: [],
      status: "verify_current_call",
    },
    criteria_version: `${id}.2026-08-10`,
    strict_gates: [
      {
        gate_id: `${id}-official-call`,
        title: "وجود دعوة مفتوحة وشروط دورة حالية",
        verification: "راجع بوابة الهيئة والمصدر الرسمي قبل اتخاذ قرار التقديم.",
        fact_path: "application_status",
        operator: "equals",
        expected: "open",
        blocking: true,
      },
    ],
    evidence_required: ["رابط الدعوة الحالية", "دليل الأهلية", "موعد الإغلاق"],
    review: {
      status: "approved",
      reviewed_at: VERIFIED_AT,
      reviewer_role: "funding_catalog_editor",
      note: "المصدر والبرنامج موثقان؛ تفاصيل الدورة الحالية تبقى غير محسومة حتى التحقق من الدعوة الرسمية.",
    },
  };
}

const FUNDING_CATALOG = Object.freeze([
  rdiaProgram("rdia-bsg", "منحة العلوم الأساسية", "للأبحاث الأساسية التي تستهدف إضافة علمية أصيلة ضمن الأولويات الوطنية.", {
    keywords: ["علوم أساسية", "بحث أساسي", "اكتشاف", "نظرية", "مختبر"],
    target_project_types: ["بحث أساسي", "بحث"],
    min_trl: 1,
    max_trl: 3,
  }),
  rdiaProgram("rdia-bsrcg", "منحة اتحاد أبحاث العلوم الأساسية", "لأعمال العلوم الأساسية التي تحتاج تعاونًا بحثيًا متعدد الجهات أو التخصصات.", {
    keywords: ["اتحاد بحثي", "تعاون", "متعدد التخصصات", "علوم أساسية"],
    target_project_types: ["اتحاد بحثي", "بحث أساسي", "بحث"],
    min_trl: 1,
    max_trl: 3,
    applicant_types: ["جامعة", "مركز بحثي", "اتحاد بحثي"],
  }),
  rdiaProgram("rdia-bag", "منحة البحوث التطبيقية", "لتحويل المعرفة إلى حل تطبيقي قابل للاختبار في سياق استخدام واضح.", {
    keywords: ["بحث تطبيقي", "حل", "اختبار", "تطبيق", "نموذج"],
    target_project_types: ["بحث تطبيقي", "ابتكار", "بحث"],
    min_trl: 2,
    max_trl: 5,
  }),
  rdiaProgram("rdia-tdg", "منحة تطوير التقنية", "لتطوير تقنية أو نموذج أولي ورفع جاهزيته عبر الاختبار والتحقق.", {
    keywords: ["تقنية", "نموذج أولي", "تحقق", "اختبار", "تطوير"],
    target_project_types: ["تطوير تقنية", "ابتكار", "نموذج أولي"],
    min_trl: 3,
    max_trl: 7,
  }),
  rdiaProgram("rdia-aiig", "منحة الابتكار بين الأكاديميا والصناعة", "لمشروعات تربط جهة بحثية بشريك صناعي حول تطبيق واحتياج قابل للقياس.", {
    keywords: ["شريك صناعي", "شركة", "تصنيع", "سوق", "نقل تقنية"],
    target_project_types: ["ابتكار صناعي", "بحث تطبيقي", "نقل تقنية"],
    min_trl: 4,
    max_trl: 8,
    applicant_types: ["جامعة", "مركز بحثي", "شركة", "شراكة أكاديمية صناعية"],
    partner_requirement: { required: true, type: "شريك صناعي", status: "verify_current_call" },
  }),
  rdiaProgram("rdia-seig", "منحة الباحث السعودي الناشئ", "مسار موجه للباحثين الناشئين لبناء استقلالهم وخبرتهم البحثية.", {
    keywords: ["باحث ناشئ", "باحث سعودي", "بداية المسار", "عضو هيئة تدريس"],
    target_project_types: ["بحث", "بحث أساسي", "بحث تطبيقي"],
    applicant_types: ["باحث ناشئ", "باحث سعودي", "جامعة"],
  }),
  rdiaProgram("rdia-ifg", "منحة الابتكار الرائدة", "لمبادرات ابتكارية كبيرة مرتبطة بأثر وطني ومسار تنفيذ واضح.", {
    keywords: ["ابتكار", "أثر وطني", "توسع", "منتج", "ملكية فكرية"],
    target_project_types: ["ابتكار", "منتج", "مشروع وطني"],
    min_trl: 4,
    max_trl: 8,
  }),
  rdiaProgram("rdia-afg", "منحة المسرّعة الرائدة", "لمشروعات ناضجة نسبيًا تحتاج تسريع التحقق والتطبيق والتوسع.", {
    keywords: ["تسريع", "توسع", "عميل", "تجربة ميدانية", "منتج أولي"],
    target_project_types: ["منتج أولي", "شركة ناشئة", "ابتكار"],
    min_trl: 5,
    max_trl: 9,
  }),
  rdiaProgram("rdia-cfg", "منحة الاتحاد الرائدة", "لمبادرات كبرى متعددة الجهات تحتاج حوكمة واتحادًا تنفيذيًا وأثرًا وطنيًا.", {
    keywords: ["اتحاد", "عدة جهات", "برنامج وطني", "أثر واسع", "حوكمة"],
    target_project_types: ["اتحاد بحثي", "مشروع وطني", "برنامج بحثي"],
    min_trl: 3,
    max_trl: 8,
    applicant_types: ["اتحاد بحثي", "جامعة", "مركز بحثي", "شراكة أكاديمية صناعية"],
  }),
]);

module.exports = {
  CATALOG_VERSION,
  VERIFIED_AT,
  FUNDING_CATALOG,
};
