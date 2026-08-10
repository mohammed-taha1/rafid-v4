"use strict";

(() => {
  const stored = localStorage.getItem("rafid-language");
  let language = stored === "en" ? "en" : "ar";
  const dictionary = new Map([
    ["انتقل إلى المحتوى", "Skip to content"], ["رافد، الصفحة الرئيسية", "Rafid, home"], ["مبادئ رافد", "Rafid principles"],
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
    ["ارفع ملفًا واحدًا أو عدة ملفات، أو الصق النص. ستحصل على تقييم تقني وتمويلي مفسر وخطة تحسين واضحة.", "Upload one or more files, or paste text. You will receive explained technical and funding scores with a clear improvement plan."],
    ["اسحب ملفات البحث هنا", "Drop research files here"], ["حتى 5 ملفات: PDF · DOCX · TXT · MD، كل ملف حتى 20MB", "Up to 5 files: PDF · DOCX · TXT · MD, each up to 20 MB"],
    ["أو", "or"], ["الصق نص البحث", "Paste research text"], ["0 حرف", "0 characters"],
    ["ألصق ملخص البحث أو المسودة أو محتوى المشروع هنا…", "Paste the research abstract, draft, or project content here…"],
    ["التقييم استرشادي، وقد تختلف الشروط بين فرص التمويل. راجع الجهة الممولة قبل التقديم.", "The assessment is advisory, and criteria vary across funding opportunities. Verify with the funder before applying."],
    ["ابدأ تحليل الجاهزية", "Start readiness analysis"], ["بالبدء توافق على معالجة المحتوى لهذا الطلب فقط وفق سياسة الخصوصية.", "By starting, you agree to process the content only for this request under the privacy policy."],
    ["إلغاء التحليل", "Cancel analysis"], ["تحليل جديد", "New analysis"],
    ["نتيجة التقييم العام", "General assessment result"], ["جاهزية البحث", "Research readiness"],
    ["مستوى الثقة:", "Confidence level:"], ["تفسير الدرجات", "Score explanations"], ["النواقص الحرجة", "Critical gaps"],
    ["مرتفع", "High"], ["متوسط", "Medium"], ["منخفض", "Low"],
    ["لصق النص", "Paste text"], ["رفع ملف", "Upload file"], ["حلّل جاهزية البحث", "Assess research readiness"],
    ["مقارنة بفرصة محددة", "Specific opportunity match"], ["قارن بحثك بفرصة تمويل", "Compare your research with a funding opportunity"],
    ["ثلاث خطوات قصيرة. أضف الفرصة أولًا، ثم البحث، وراجع المدخلات قبل التحليل.", "Three short steps: add the opportunity, add the research, then review the inputs before analysis."],
    ["جرّب مثالًا تدريبيًا", "Try a training example"], ["الفرصة", "Opportunity"], ["الشروط الرسمية", "Official criteria"],
    ["البحث", "Research"], ["الملفات والأدلة", "Files and evidence"], ["المراجعة", "Review"], ["ثم التحليل", "Then analyze"],
    ["الخطوة ١ من ٣", "Step 1 of 3"], ["الخطوة ٢ من ٣", "Step 2 of 3"], ["الخطوة ٣ من ٣", "Step 3 of 3"],
    ["أضف فرصة التمويل", "Add the funding opportunity"], ["أضف البحث أو المشروع", "Add the research or project"], ["راجع ثم ابدأ التحليل", "Review, then start analysis"],
    ["ارفع دليل الفرصة، أو الصق شروط الأهلية والتقييم. لا يلزم تعبئة الحقول الاختيارية.", "Upload the opportunity guide or paste its eligibility and evaluation criteria. Optional fields are not required."],
    ["اسحب ملف الفرصة هنا", "Drop the opportunity file here"], ["أو اختر PDF · DOCX · TXT · MD حتى 20MB", "or choose PDF · DOCX · TXT · MD up to 20 MB"],
    ["الصق نص الفرصة", "Paste opportunity text"], ["بيانات الفرصة الاختيارية", "Optional opportunity details"], ["التالي: إضافة البحث", "Next: add research"],
    ["لن نطلب تسجيل الدخول، ولن نحفظ البحث أو ملفاته افتراضيًا.", "We will not require sign-in and will not store the research or its files by default."],
    ["فرصة التمويل", "Funding opportunity"], ["البحث أو المشروع", "Research or project"], ["تعديل", "Edit"], ["قبل البدء", "Before you begin"],
    ["النتيجة استرشادية ولا تضمن التمويل.", "The result is advisory and does not guarantee funding."], ["راجع دائمًا المصدر الرسمي للفرصة.", "Always verify the opportunity's official source."],
    ["لا ترفع بيانات مشاركين أو معلومات شديدة الحساسية.", "Do not upload participant data or highly sensitive information."],
    ["السابق", "Back"], ["ابدأ التحليل المؤسسي", "Start institutional analysis"],
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
    root.querySelectorAll?.("[placeholder]").forEach((node) => {
      const placeholder = node.getAttribute("placeholder");
      if (dictionary.has(placeholder)) node.setAttribute("placeholder", dictionary.get(placeholder));
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
