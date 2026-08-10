"use strict";

(() => {
  const stored = localStorage.getItem("rafid-language");
  let language = stored === "en" ? "en" : "ar";
  const dictionary = new Map([
    ["الخدمات", "Services"], ["كيف يعمل؟", "How it works"], ["الخصوصية", "Privacy"],
    ["للمؤسسات", "Institutions"], ["طريقة الاستخدام", "How to use"],
    ["الرئيسية", "Home"], ["الأسئلة الشائعة", "FAQ"], ["مركز التعلم", "Learning center"],
    ["عن رافد", "About Rafid"], ["الشروط", "Terms"], ["تواصل معنا", "Contact"],
    ["ابدأ من احتياجك", "Start with your goal"], ["ماذا تريد أن تنجز الآن؟", "What would you like to accomplish?"],
    ["قيّم جاهزية البحث", "Assess research readiness"], ["طابق البحث مع فرصة محددة", "Match research to an opportunity"],
    ["اكتشف الفرص المناسبة", "Discover relevant opportunities"], ["رتّب محفظة المشاريع", "Prioritize a project portfolio"],
    ["رافد للمؤسسات البحثية", "Rafid for research institutions"], ["مساحة عمل المؤسسة", "Institution workspace"],
    ["النتائج استرشادية ولا تضمن القبول أو التمويل. المصدر الرسمي هو المرجع النهائي.", "Results are advisory and do not guarantee acceptance or funding. The official source remains authoritative."],
    ["تحليل الجاهزية العامة", "General readiness analysis"], ["أضف بحثك، واترك الباقي لرافد", "Add your research and let Rafid structure the review"],
    ["دون تسجيل دخول", "No sign-in required"], ["حتى 5 ملفات", "Up to 5 files"], ["لا حفظ افتراضي", "No storage by default"],
    ["أضف محتوى للبدء", "Add content to begin"], ["سيشمل التقرير", "Your report includes"],
    ["الجاهزية التقنية", "Technical readiness"], ["الجاهزية التمويلية", "Funding readiness"], ["الفجوات الحرجة", "Critical gaps"],
    ["خطة العمل", "Action plan"], ["العودة للخدمات", "Back to services"], ["ابدأ تحليلًا جديدًا", "Start a new analysis"],
    ["نسخ الملخص", "Copy summary"], ["طباعة التقرير", "Print report"], ["تنزيل تقرير مقروء", "Download readable report"],
    ["غير موضح", "Not stated"], ["موجود", "Present"], ["جزئي", "Partial"], ["ثقة عالية", "High confidence"],
    ["ثقة متوسطة", "Medium confidence"], ["ثقة منخفضة", "Low confidence"], ["نقاط القوة", "Strengths"],
    ["النواقص المهمة", "Important gaps"], ["التحسينات الإضافية", "Additional improvements"],
    ["القيود والتنبيهات", "Limitations and notices"], ["الأسئلة التي يجب الإجابة عنها", "Questions to answer"],
    ["قائمة تحقق قبل التقديم", "Pre-submission checklist"], ["قراءة المحتوى", "Reading content"],
    ["تحليل العناصر", "Analyzing elements"], ["تقييم الجاهزية", "Scoring readiness"], ["إعداد التوصيات", "Preparing recommendations"],
    ["منصة الجاهزية البحثية والتمويلية", "Research and funding readiness platform"],
    ["قرار أوضح لبحثك،", "A clearer decision for your research,"], ["قبل أن تبدأ التقديم", "before you submit"],
    ["حلّل جاهزية بحثك أو قارنه مباشرة بفرصة تمويل. خطوات قصيرة، ملفات متعددة، ونتيجة عربية قابلة للمراجعة.", "Assess your research readiness or compare it directly with a funding opportunity. A short workflow, multiple files, and a reviewable structured result."],
    ["مصمم للعمل المؤسسي", "Designed for institutional work"], ["✓ لا يحتاج تسجيل دخول", "✓ Public analysis needs no sign-in"], ["لا يحتاج تسجيل دخول", "Public analysis needs no sign-in"],
    ["✓ لا نخزن البحث افتراضيًا", "✓ Research is not stored by default"], ["لا نخزن البحث افتراضيًا", "Research is not stored by default"], ["✓ لا نعرض نتيجة بلا تفسير", "✓ Every result includes an explanation"], ["لا نعرض نتيجة بلا تفسير", "Every result includes an explanation"],
    ["اختر خدمة واحدة. لن ننقلك إلى نموذج طويل قبل أن تعرف المطلوب.", "Choose one service. You will see the required inputs before entering a long workflow."],
    ["لدي بحث فقط", "I have research only"], ["لدي بحث وفرصة", "I have research and an opportunity"],
    ["لدي بحث وأبحث عن فرصة", "I have research and need an opportunity"], ["لدي فرصة وعدة مشاريع", "I have one opportunity and several projects"],
    ["اختر هذا المسار إذا لم تحدد فرصة تمويل بعد. ستحصل على تقييم عام للفجوات وخطة التحسين.", "Use this path if you have not selected an opportunity. You will receive a general gap assessment and improvement plan."],
    ["تحليل بحث واحد دون فرصة", "Analyze one research project without an opportunity"],
    ["اختر هذا المسار إذا لديك شروط فرصة بعينها. سنفحص الأهلية والأدلة والملاءمة لهذه الفرصة فقط.", "Use this path when you have the criteria for a specific opportunity. We will check eligibility, evidence, and fit for that opportunity only."],
    ["مطابقة بحث + فرصة", "Match research + opportunity"],
    ["رتّب مسارات التمويل الأقرب لبحثك، وافهم سبب الترشيح وما يحتاج تحققًا.", "Rank the funding paths closest to your research and see why each was suggested and what needs verification."],
    ["حلّل البحث واقترح الفرص", "Analyze research and suggest opportunities"],
    ["قارن من مشروعين إلى خمسة بالأهلية أولًا ثم الجاهزية والأدلة.", "Compare two to five projects by eligibility first, then readiness and evidence."],
    ["قارن المشاريع مؤسسيًا", "Compare projects institutionally"],
    ["رحلة مختصرة", "A concise journey"], ["من الملف إلى قرار قابل للتنفيذ", "From a file to an actionable decision"],
    ["أضف المحتوى", "Add content"], ["PDF أو DOCX أو TXT أو MD، ويمكن جمع عدة ملفات بحثية.", "Upload PDF, DOCX, TXT, or MD and combine several research files."],
    ["نحلل الأدلة", "We analyze the evidence"], ["نفصل المعلومات الموجودة عن الاستنتاجات والفجوات.", "We separate stated facts from inferences and gaps."],
    ["راجع القرار", "Review the decision"], ["درجات مفسرة وخطة عمل مرتبة قبل التقديم.", "Explained scores and an ordered action plan before submission."],
    ["الخصوصية أصل", "Privacy by design"], ["المعالجة للطلب الحالي دون حفظ افتراضي", "Process the current request without default storage"],
    ["الدليل قبل الحكم", "Evidence before judgment"], ["كل نتيجة مرتبطة بما ورد في المحتوى", "Every result is tied to supplied content"],
    ["خطة قابلة للتنفيذ", "An actionable plan"], ["الفجوات تتحول إلى إجراءات ومخرجات واضحة", "Gaps become clear actions and deliverables"],
  ]);

  function applyDocumentLanguage() {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.language = language;
    document.title = language === "ar" ? "رافد | الجاهزية البحثية والتمويلية" : "Rafid | Research and funding readiness";
  }

  function translateTree(root = document.body) {
    if (language !== "en" || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const original = node.nodeValue.trim();
      if (!original || !dictionary.has(original)) continue;
      node.nodeValue = node.nodeValue.replace(original, dictionary.get(original));
    }
    root.querySelectorAll?.("[aria-label]").forEach((node) => {
      const label = node.getAttribute("aria-label");
      if (dictionary.has(label)) node.setAttribute("aria-label", dictionary.get(label));
    });
  }

  function controls() {
    return `<div class="language-switch" role="group" aria-label="Language"><button type="button" data-rafid-language="ar" aria-pressed="${language === "ar"}">عربي</button><button type="button" data-rafid-language="en" aria-pressed="${language === "en"}">EN</button></div>`;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rafid-language]");
    if (!button) return;
    const next = button.dataset.rafidLanguage;
    if (!["ar", "en"].includes(next) || next === language) return;
    localStorage.setItem("rafid-language", next);
    location.reload();
  });

  applyDocumentLanguage();
  const observer = new MutationObserver((records) => {
    if (language !== "en") return;
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) translateTree(node);
  });
  window.addEventListener("DOMContentLoaded", () => {
    translateTree();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  window.RafidI18n = Object.freeze({
    get language() { return language; },
    isEnglish: () => language === "en",
    t: (arabic, english) => language === "en" ? english : arabic,
    controls,
    translateTree,
  });
})();
