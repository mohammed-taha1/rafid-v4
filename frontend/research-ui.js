"use strict";

(() => {
  let controller;
  let elapsedTimer;
  let requestInFlight = false;
  let runtime = { auth: { enabled: false, required: false }, limits: { max_file_size_mb: 20 } };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const root = () => document.querySelector(".rafid");
  const match = () => window.RafidOpportunityMatch;
  const items = (value) => Array.isArray(value) ? value : [];
  const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

  function resetView(focusSelector = "h1") {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    requestAnimationFrame(() => root()?.querySelector(focusSelector)?.focus({ preventScroll: true }));
  }

  async function loadRuntime() {
    try {
      const response = await fetch("/api/rafid/public/config", { headers: { Accept: "application/json" } });
      if (response.ok) runtime = await response.json();
    } catch {
      // تبقى الصفحات العامة متاحة إذا تعذر تحميل إعدادات العرض.
    }
  }

  function header(action = "") {
    return `<header class="rafid-header">
      <a class="rafid-logo" href="#home" aria-label="رافد، الصفحة الرئيسية"><span class="brand-logo-crop"><img src="assets/rafid-logo.png" alt="" width="1254" height="1254" /></span><b class="sr-only">رافد</b></a>
      ${action}
    </header>`;
  }

  function stopElapsedTimer() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = undefined;
  }

  function startElapsedTimer(main) {
    stopElapsedTimer();
    const node = main.querySelector("#analysisElapsed");
    if (!node) return;
    const startedAt = Date.now();
    node.hidden = false;
    const update = () => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainder = seconds % 60;
      node.textContent = seconds >= 45
        ? `الوقت المنقضي: ${minutes} د ${remainder} ث — قد تكون الخدمة في بدء بارد أو تعالج مستندًا طويلًا؛ المدخلات محفوظة في هذه الصفحة.`
        : `الوقت المنقضي: ${seconds} ث — نراجع الشروط والأدلة دون نسبة تقدم مصطنعة.`;
    };
    update();
    elapsedTimer = setInterval(update, 1000);
  }

  function app() {
    const existing = root();
    const main = existing || document.createElement("main");
    main.id = "rafidApp";
    main.className = "rafid";
    main.removeAttribute("aria-busy");
    main.innerHTML = `${header('<nav aria-label="روابط رافد"><a href="#services">الخدمات</a><a href="#how">كيف يعمل؟</a><a href="#privacy">الخصوصية</a></nav>')}
      <section class="portal-hero">
        <div><span class="rafid-kicker"><i aria-hidden="true"></i> منصة الجاهزية البحثية والتمويلية</span><h1 tabindex="-1">قرار أوضح لبحثك، <em>قبل أن تبدأ التقديم</em></h1><p>حلّل جاهزية بحثك أو قارنه مباشرة بفرصة تمويل. خطوات قصيرة، ملفات متعددة، ونتيجة عربية قابلة للمراجعة.</p></div>
        <aside><b>مصمم للعمل المؤسسي</b><ul><li>لا يحتاج تسجيل دخول</li><li>لا نخزن البحث افتراضيًا</li><li>لا نعرض نتيجة بلا تفسير</li></ul></aside>
      </section>
      <section id="services" class="service-console" aria-labelledby="servicesTitle">
        <div class="section-heading"><span class="rafid-kicker">ابدأ من احتياجك</span><h2 id="servicesTitle">ماذا تريد أن تنجز الآن؟</h2><p>اختر خدمة واحدة. لن ننقلك إلى نموذج طويل قبل أن تعرف المطلوب.</p></div>
        <div class="service-grid">
          <button id="startGeneral" class="service-card is-primary" type="button"><span class="service-number">01</span><span class="service-status">لدي بحث فقط</span><strong>قيّم جاهزية البحث</strong><small>اختر هذا المسار إذا لم تحدد فرصة تمويل بعد. ستحصل على تقييم عام للفجوات وخطة التحسين.</small><i>تحليل بحث واحد دون فرصة <b aria-hidden="true">←</b></i></button>
          <button id="startMatch" class="service-card" type="button"><span class="service-number">02</span><span class="service-status">لدي بحث وفرصة</span><strong>طابق البحث مع فرصة محددة</strong><small>اختر هذا المسار إذا لديك شروط فرصة بعينها. سنفحص الأهلية والأدلة والملاءمة لهذه الفرصة فقط.</small><i>مطابقة بحث + فرصة <b aria-hidden="true">←</b></i></button>
          <article class="service-card is-upcoming" aria-label="اقتراح فرص التمويل، قريبًا"><span class="service-number">03</span><span class="service-status">قريبًا</span><strong>اكتشف الفرص المناسبة</strong><small>ترشيح فرص بحسب مجال البحث وجاهزيته وشروط الأهلية.</small><i>ضمن المرحلة التالية</i></article>
        </div>
      </section>
      <section id="how" class="institutional-flow"><div><span class="rafid-kicker">رحلة مختصرة</span><h2>من الملف إلى قرار قابل للتنفيذ</h2></div><ol><li><span>١</span><b>أضف المحتوى</b><small>PDF أو DOCX أو TXT أو MD، ويمكن جمع عدة ملفات بحثية.</small></li><li><span>٢</span><b>نحلل الأدلة</b><small>نفصل المعلومات الموجودة عن الاستنتاجات والفجوات.</small></li><li><span>٣</span><b>راجع القرار</b><small>درجات مفسرة وخطة عمل مرتبة قبل التقديم.</small></li></ol></section>
      <section class="trust-rail" aria-label="مبادئ رافد"><div><span aria-hidden="true">01</span><b>الخصوصية أصل</b><small>المعالجة للطلب الحالي دون حفظ افتراضي</small></div><div><span aria-hidden="true">02</span><b>الدليل قبل الحكم</b><small>كل نتيجة مرتبطة بما ورد في المحتوى</small></div><div><span aria-hidden="true">03</span><b>خطة قابلة للتنفيذ</b><small>الفجوات تتحول إلى إجراءات ومخرجات واضحة</small></div></section>
      <footer><div><b>رافد</b><p>النتائج استرشادية ولا تضمن القبول أو التمويل. المصدر الرسمي هو المرجع النهائي.</p></div><nav><a href="#about">عن رافد</a><a href="#learn">مركز التعلم</a><a href="#privacy">الخصوصية</a><a id="terms" href="#terms">الشروط</a></nav></footer>`;
    if (!existing) document.body.prepend(main);
    main.querySelector("#startMatch").addEventListener("click", matchView);
    main.querySelector("#startGeneral").addEventListener("click", generalView);
    resetView();
  }

  async function readSource(textInput, fileInput, label, { maxFiles = 1 } = {}) {
    const typed = textInput.value.trim();
    const files = Array.from(fileInput.files || []);
    if (typed && files.length) throw new Error(`اختر لصق نص ${label} أو رفع ملفاته، وليس الاثنين معًا.`);
    if (!typed && !files.length) throw new Error(`أدخل نص ${label} أو ارفع ملفًا.`);
    if (files.length > maxFiles) throw new Error(`يمكن رفع ${maxFiles} ${maxFiles === 1 ? "ملف فقط" : "ملفات كحد أقصى"} لـ${label}.`);
    if (!files.length) return { text: typed, files: [], sourceName: "نص أدخله المستخدم" };
    const documents = [];
    for (const file of files) {
      const documentData = await window.RafidIngest.read(file, {
        maxFileSizeMb: runtime.limits?.max_file_size_mb || 20,
      });
      documents.push({ file, documentData });
    }
    return {
      text: documents.map(({ file, documentData }) => `### ${documentData.safeDisplayName || file.name}\n${documentData.fullText}`).join("\n\n"),
      files: documents.map(({ file }) => file),
      sourceName: documents.map(({ file, documentData }) => documentData.safeDisplayName || file.name).join("، "),
    };
  }

  async function callApi(path, body, signal) {
    const response = await fetch(`/api/rafid/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const messages = {
        RAFID_GLOBAL_DAILY_LIMIT: "اكتملت الحصة التجريبية لليوم. احتفظ بمدخلاتك وحاول في اليوم التالي.",
        RAFID_USER_RATE_LIMIT: "وصلت طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.",
        RAFID_PROVIDER_TIMEOUT: "استغرق التحليل أطول من المهلة. بقيت مدخلاتك كما هي؛ حاول مجددًا بعد لحظات.",
        RAFID_PROVIDER_UNAVAILABLE: "خدمة التحليل مزدحمة أو تبدأ من السكون. بقيت مدخلاتك؛ حاول مجددًا بعد دقيقة.",
        RAFID_INVALID_PROVIDER_RESPONSE: "تعذر التحقق من نتيجة المزود. لم نعرض نتيجة غير موثوقة؛ حاول مجددًا.",
        RAFID_GROQ_UNAVAILABLE: "خدمة التحليل غير متاحة مؤقتًا. بقيت مدخلاتك؛ حاول مجددًا بعد دقيقة.",
        RAFID_GROQ_RATE_LIMITED: "بلغت خدمة التحليل حدها المؤقت. انتظر قليلًا ثم حاول مجددًا.",
        RAFID_PROVIDER_NOT_CONFIGURED: "خدمة التحليل لم تكتمل تهيئتها بعد. الصفحات العامة متاحة، لكن التحليل يحتاج تدخل المشغّل.",
        RAFID_ZDR_REQUIRED: "أوقف رافد الإرسال لأن ضمان عدم الاحتفاظ غير مؤكد. لم يُرسل المحتوى.",
        RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED: "لم تجتز النتيجة التحقق البنيوي، لذلك لم نعرضها. حاول مجددًا.",
        PROVIDER_UNAVAILABLE: "خدمة التحليل مزدحمة أو تبدأ من السكون. بقيت مدخلاتك؛ حاول مجددًا بعد دقيقة.",
      };
      const error = new Error(messages[payload.code] || payload.error || "تعذر إكمال التحليل الآن. بقيت المدخلات لتستطيع المحاولة مجددًا.");
      error.code = payload.code || "RAFID_REQUEST_FAILED";
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    return payload;
  }

  function setFileStatus(main, input, target, defaultText) {
    input.addEventListener("change", () => {
      const selected = Array.from(input.files || []);
      target.textContent = selected.length ? (selected.length === 1 ? `تم اختيار: ${selected[0].name}` : `تم اختيار ${selected.length} ملفات`) : defaultText;
    });
  }

  function bindDropZone(input, zone) {
    if (!input || !zone) return;
    for (const eventName of ["dragenter", "dragover"]) zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add("is-dragging"); });
    for (const eventName of ["dragleave", "drop"]) zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove("is-dragging"); });
    zone.addEventListener("drop", (event) => {
      const transfer = new DataTransfer();
      const limit = input.multiple ? 5 : 1;
      Array.from(event.dataTransfer?.files || []).slice(0, limit).forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function showWizardStep(main, step) {
    main.querySelectorAll("[data-wizard-panel]").forEach((panel) => { panel.hidden = Number(panel.dataset.wizardPanel) !== step; });
    main.querySelectorAll("[data-wizard-step]").forEach((item) => {
      const number = Number(item.dataset.wizardStep);
      item.classList.toggle("is-current", number === step);
      item.classList.toggle("is-complete", number < step);
      item.setAttribute("aria-current", number === step ? "step" : "false");
    });
    const active = main.querySelector(`[data-wizard-panel="${step}"] h2`);
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    active?.focus({ preventScroll: true });
  }

  function institutionalizeMatchForm(main, maxSize) {
    main.querySelector(".match-intro").innerHTML = `<div><span class="rafid-kicker">مقارنة بفرصة محددة</span><h1 tabindex="-1">قارن بحثك بفرصة تمويل</h1><p>ثلاث خطوات قصيرة. أضف الفرصة أولًا، ثم البحث، وراجع المدخلات قبل التحليل.</p></div><button id="loadTrainingExample" class="rafid-secondary demo-fill-button" type="button">جرّب مثالًا تدريبيًا</button>`;
    main.querySelector(".match-assurance")?.remove();
    const form = main.querySelector(".match-form");
    form.className = "analysis-workspace match-form";
    form.innerHTML = `
      <ol class="workflow-stepper" aria-label="خطوات مقارنة البحث بالفرصة"><li data-wizard-step="1" class="is-current" aria-current="step"><span>١</span><b>الفرصة</b><small>الشروط الرسمية</small></li><li data-wizard-step="2"><span>٢</span><b>البحث</b><small>الملفات والأدلة</small></li><li data-wizard-step="3"><span>٣</span><b>المراجعة</b><small>ثم التحليل</small></li></ol>
      <section class="wizard-panel" data-wizard-panel="1"><div class="wizard-heading"><span>الخطوة ١ من ٣</span><h2 tabindex="-1">أضف فرصة التمويل</h2><p>ارفع دليل الفرصة، أو الصق شروط الأهلية والتقييم. لا يلزم تعبئة الحقول الاختيارية.</p></div>
        <div class="source-choice-grid"><label id="oppDrop" class="file-picker drop-zone"><input id="oppFile" type="file" accept=".pdf,.docx,.txt,.md" /><span class="drop-icon" aria-hidden="true">⇧</span><b>اسحب ملف الفرصة هنا</b><small id="oppFileStatus">أو اختر PDF · DOCX · TXT · MD حتى ${maxSize}MB</small></label><div class="choice-divider"><span>أو</span></div><label class="paste-source"><b>الصق نص الفرصة</b><textarea id="oppText" rows="9" aria-describedby="oppCount" placeholder="الصق شروط الأهلية، معايير التقييم، الوثائق المطلوبة والموعد…"></textarea><span id="oppCount">0 حرف</span></label></div>
        <details class="advanced-fields"><summary>بيانات الفرصة الاختيارية</summary><div class="match-meta-grid"><label>اسم الفرصة<input id="oppTitle" autocomplete="off" placeholder="مثال: برنامج دعم الابتكار" /></label><label>الجهة الممولة<input id="oppFunder" autocomplete="off" placeholder="اسم الجهة كما ورد" /></label><label>رابط المصدر الرسمي<input id="oppUrl" type="url" dir="ltr" inputmode="url" placeholder="https://…" /></label><label>موعد الإغلاق<input id="oppDeadline" type="date" /></label></div></details>
        <p id="stepOneError" class="rafid-error" role="alert"></p><div class="wizard-actions"><button id="backHome" class="rafid-text-button" type="button">العودة للخدمات</button><button id="nextToResearch" class="rafid-primary" type="button">التالي: إضافة البحث</button></div>
      </section>
      <section class="wizard-panel" data-wizard-panel="2" hidden><div class="wizard-heading"><span>الخطوة ٢ من ٣</span><h2 tabindex="-1">أضف البحث أو المشروع</h2><p>يمكن رفع حتى 5 ملفات وجمعها في تحليل واحد، أو لصق نص البحث مباشرة.</p></div>
        <div class="source-choice-grid"><label id="researchDrop" class="file-picker drop-zone"><input id="researchFile" type="file" accept=".pdf,.docx,.txt,.md" multiple /><span class="drop-icon" aria-hidden="true">⇧</span><b>اسحب ملفات البحث هنا</b><small id="researchFileStatus">حتى 5 ملفات: PDF · DOCX · TXT · MD، كل ملف حتى ${maxSize}MB</small></label><div class="choice-divider"><span>أو</span></div><label class="paste-source"><b>الصق نص البحث</b><textarea id="researchText" rows="11" aria-describedby="researchCount" placeholder="الصق الملخص أو المسودة أو محتوى المشروع…"></textarea><span id="researchCount">0 حرف</span></label></div>
        <label class="compact-field">عنوان مختصر <span>(اختياري)</span><input id="projectTitle" autocomplete="off" placeholder="اسم البحث أو المشروع" /></label>
        <p id="stepTwoError" class="rafid-error" role="alert"></p><div class="wizard-actions"><button id="backToOpportunity" class="rafid-secondary" type="button">السابق</button><button id="nextToReview" class="rafid-primary" type="button">التالي: مراجعة المدخلات</button></div>
      </section>
      <section class="wizard-panel review-panel" data-wizard-panel="3" hidden><div class="wizard-heading"><span>الخطوة ٣ من ٣</span><h2 tabindex="-1">راجع ثم ابدأ التحليل</h2><p>لن نطلب تسجيل الدخول، ولن نحفظ البحث أو ملفاته افتراضيًا.</p></div>
        <div class="review-source-grid"><article><span>فرصة التمويل</span><b id="opportunityReview">جاهزة للمراجعة</b><button id="editOpportunity" type="button">تعديل</button></article><article><span>البحث أو المشروع</span><b id="researchReview">جاهز للمراجعة</b><button id="editResearch" type="button">تعديل</button></article></div>
        <div class="analysis-contract"><b>قبل البدء</b><ul><li>النتيجة استرشادية ولا تضمن التمويل.</li><li>راجع دائمًا المصدر الرسمي للفرصة.</li><li>لا ترفع بيانات مشاركين أو معلومات شديدة الحساسية.</li></ul><input id="privacyConfirmMatch" type="checkbox" checked hidden /></div>
        <div id="matchProgress" class="match-progress" hidden aria-live="polite"><span data-stage="opportunity">قراءة شروط الفرصة</span><span data-stage="research">تحليل البحث والأدلة</span><span data-stage="assessment">مطابقة الأهلية والملاءمة</span><span data-stage="report">إعداد التقرير وخطة العمل</span></div><p id="analysisElapsed" class="analysis-elapsed" role="status" hidden></p><p id="error" class="rafid-error" role="alert"></p>
        <div class="wizard-actions final-actions"><button id="backToResearch" class="rafid-secondary" type="button">السابق</button><button id="go" class="rafid-primary" type="button">ابدأ التحليل المؤسسي</button><button id="cancel" class="rafid-secondary" type="button" hidden>إلغاء التحليل</button></div><small class="submit-privacy">بالبدء توافق على معالجة المحتوى لهذا الطلب فقط وفق سياسة الخصوصية.</small>
      </section>`;

    const hasContent = (textId, fileId, minimum) => main.querySelector(textId).value.trim().length >= minimum || main.querySelector(fileId).files.length > 0;
    const sourceLabel = (textId, fileId) => {
      const files = Array.from(main.querySelector(fileId).files || []);
      if (files.length) return files.length === 1 ? files[0].name : `${files.length} ملفات مختارة`;
      const length = main.querySelector(textId).value.trim().length;
      return length ? `نص مباشر · ${length} حرف` : "لم يضف محتوى بعد";
    };
    main.querySelector("#nextToResearch").addEventListener("click", () => {
      const error = main.querySelector("#stepOneError");
      if (!hasContent("#oppText", "#oppFile", 100)) { error.textContent = "أضف ملف الفرصة أو الصق 100 حرف على الأقل من شروطها."; error.classList.add("is-error"); return; }
      error.textContent = ""; showWizardStep(main, 2);
    });
    main.querySelector("#nextToReview").addEventListener("click", () => {
      const error = main.querySelector("#stepTwoError");
      if (!hasContent("#researchText", "#researchFile", 30)) { error.textContent = "أضف ملف البحث أو الصق 30 حرفًا على الأقل."; error.classList.add("is-error"); return; }
      error.textContent = "";
      main.querySelector("#opportunityReview").textContent = sourceLabel("#oppText", "#oppFile");
      main.querySelector("#researchReview").textContent = sourceLabel("#researchText", "#researchFile");
      showWizardStep(main, 3);
    });
    main.querySelector("#backHome").addEventListener("click", app);
    main.querySelector("#backToOpportunity").addEventListener("click", () => showWizardStep(main, 1));
    main.querySelector("#backToResearch").addEventListener("click", () => showWizardStep(main, 2));
    main.querySelector("#editOpportunity").addEventListener("click", () => showWizardStep(main, 1));
    main.querySelector("#editResearch").addEventListener("click", () => showWizardStep(main, 2));
    bindDropZone(main.querySelector("#oppFile"), main.querySelector("#oppDrop"));
    bindDropZone(main.querySelector("#researchFile"), main.querySelector("#researchDrop"));
  }

  function matchView() {
    const main = root();
    const maxSize = Number(runtime.limits?.max_file_size_mb || 20);
    main.innerHTML = `${header('<button id="back" class="rafid-text-button" type="button">الرئيسية</button>')}<section class="match-intro"></section><section class="match-form"></section>`;

    institutionalizeMatchForm(main, maxSize);

    main.querySelector("#back").addEventListener("click", app);
    const oppText = main.querySelector("#oppText");
    const researchText = main.querySelector("#researchText");
    const oppFile = main.querySelector("#oppFile");
    const researchFile = main.querySelector("#researchFile");
    oppText.addEventListener("input", () => { main.querySelector("#oppCount").textContent = `${oppText.value.length} حرف`; });
    researchText.addEventListener("input", () => { main.querySelector("#researchCount").textContent = `${researchText.value.length} حرف`; });
    setFileStatus(main, oppFile, main.querySelector("#oppFileStatus"), `PDF · DOCX · TXT · MD حتى ${maxSize}MB`);
    setFileStatus(main, researchFile, main.querySelector("#researchFileStatus"), `حتى 5 ملفات: PDF · DOCX · TXT · MD، كل ملف حتى ${maxSize}MB`);
    main.querySelector("#go").addEventListener("click", runMatch);
    main.querySelector("#cancel").addEventListener("click", () => controller?.abort());
    main.querySelector("#loadTrainingExample").addEventListener("click", () => {
      const demo = window.RafidDemoData;
      if (!demo) return;
      main.querySelector("#oppTitle").value = demo.opportunityTitle;
      main.querySelector("#oppFunder").value = demo.funder;
      main.querySelector("#projectTitle").value = demo.projectTitle;
      oppText.value = demo.opportunity;
      researchText.value = demo.research;
      main.querySelector("#oppCount").textContent = `${oppText.value.length} حرف`;
      main.querySelector("#researchCount").textContent = `${researchText.value.length} حرف`;
      main.querySelector("#privacyConfirmMatch").checked = true;
      main.querySelector("#opportunityReview").textContent = `نص مباشر · ${oppText.value.length} حرف`;
      main.querySelector("#researchReview").textContent = `نص مباشر · ${researchText.value.length} حرف`;
      showWizardStep(main, 3);
      main.querySelector("#go").focus();
    });
    resetView();
  }

  function setStage(name) {
    const progress = root().querySelector("#matchProgress");
    if (!progress) return;
    progress.hidden = false;
    let reached = false;
    progress.querySelectorAll("[data-stage]").forEach((node) => {
      if (node.dataset.stage === name) reached = true;
      node.classList.toggle("active", node.dataset.stage === name);
      node.classList.toggle("done", !reached && node.dataset.stage !== name);
    });
  }

  async function runMatch() {
    if (requestInFlight) return;
    const main = root();
    const go = main.querySelector("#go");
    const cancel = main.querySelector("#cancel");
    const errorNode = main.querySelector("#error");
    try {
      if (!main.querySelector("#privacyConfirmMatch").checked) {
        throw new Error("أكد الموافقة على معالجة المدخلات لهذا الطلب فقط.");
      }
      const officialUrl = main.querySelector("#oppUrl").value.trim();
      if (officialUrl) {
        const parsed = new URL(officialUrl);
        if (parsed.protocol !== "https:") throw new Error("رابط المصدر الرسمي يجب أن يستخدم HTTPS.");
      }
      requestInFlight = true;
      go.disabled = true;
      cancel.hidden = false;
      errorNode.textContent = "";
      errorNode.classList.remove("is-error");
      controller = new AbortController();
      startElapsedTimer(main);

      setStage("opportunity");
      const [opportunitySource, researchSource] = await Promise.all([
        readSource(main.querySelector("#oppText"), main.querySelector("#oppFile"), "الفرصة"),
        readSource(main.querySelector("#researchText"), main.querySelector("#researchFile"), "البحث", { maxFiles: 5 }),
      ]);
      const inputValidation = match().validateInputs({
        opportunityText: opportunitySource.text,
        researchText: researchSource.text,
      });
      if (!inputValidation.valid) throw new Error(inputValidation.errors.join(" "));

      const privacy = {
        classification: "internal",
        remote_processing_confirmed: true,
        redaction_preview_confirmed: true,
        redactions_applied: [],
      };
      const opportunityRequest = match().buildOpportunityRequest({
        opportunityText: opportunitySource.text,
        opportunityTitle: main.querySelector("#oppTitle").value,
        funder: main.querySelector("#oppFunder").value,
        officialUrl,
        deadline: main.querySelector("#oppDeadline").value,
        opportunitySourceName: opportunitySource.sourceName,
        privacy,
      });
      const projectRequest = match().buildProjectRequest({
        researchText: researchSource.text,
        projectTitle: main.querySelector("#projectTitle").value,
        projectFiles: researchSource.files,
        privacy,
      });
      const opportunityResponse = await callApi("opportunity/extract", opportunityRequest, controller.signal);

      setStage("research");
      const projectResponse = await callApi("extract", projectRequest, controller.signal);

      setStage("assessment");
      const assessmentRequest = match().buildAssessmentRequest({
        opportunity: opportunityResponse.opportunity,
        project: projectResponse.project_data,
        privacy,
      });
      const assessmentResponse = await callApi("opportunity/assess", assessmentRequest, controller.signal);
      const assessmentValidation = match().validateAssessment(assessmentResponse.assessment);
      if (!assessmentValidation.valid) throw new Error("أعاد الخادم نتيجة غير مكتملة. أعد المحاولة لاحقًا.");

      setStage("report");
      renderMatchResults({
        opportunity: opportunityResponse.opportunity,
        assessment: assessmentResponse.assessment,
        meta: {
          opportunity: opportunityResponse.extraction_meta,
          project: projectResponse.extraction_meta,
          assessment: assessmentResponse.assessment_meta,
        },
      });
    } catch (errorValue) {
      stopElapsedTimer();
      errorNode.textContent = errorValue.name === "AbortError" ? "أُلغي التحليل. بقيت المدخلات لتستطيع المحاولة مجددًا." : errorValue.message;
      errorNode.classList.add("is-error");
      errorNode.dataset.retryable = errorValue.retryable ? "true" : "false";
      requestInFlight = false;
      go.disabled = false;
      cancel.hidden = true;
    }
  }

  function safeList(value, empty = "غير موضح") {
    return items(value).length ? `<ul>${items(value).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : `<p class="empty-value">${esc(empty)}</p>`;
  }

  function statusClass(status) {
    return {
      "مستوفى": "met",
      "مستوفى جزئيًا": "partial",
      "غير مستوفى": "failed",
      "غير معروف": "unknown",
      "لا ينطبق": "neutral",
    }[status] || "unknown";
  }

  function renderGate(gate, index) {
    const evidence = items(gate.project_evidence);
    return `<details class="match-gate ${statusClass(gate.status)}" ${index < 2 ? "open" : ""}>
      <summary><span>${esc(gate.status)}</span><b>${esc(gate.requirement)}</b><small>${esc(gate.resolution)}</small></summary>
      <div class="match-gate-body">
        <p><b>أساس الحكم:</b> ${esc(gate.verdict_basis || "غير موضح")}</p>
        <blockquote><b>من نص الفرصة:</b> ${esc(gate.opportunity_source_quote || "لم يتوفر اقتباس واضح.")}</blockquote>
        <div><b>أدلة البحث:</b>${evidence.length ? `<ul>${evidence.map((entry) => `<li>${esc(entry.evidence)} <small>(${esc(entry.strength)})</small></li>`).join("")}</ul>` : '<p class="empty-value">لم يتوفر دليل في البحث.</p>'}</div>
        <div><b>الدليل المطلوب:</b>${safeList(gate.missing_evidence)}</div>
        <p><b>الإجراء:</b> ${esc(gate.remediation || "راجع الشرط يدويًا.")}</p>
      </div>
    </details>`;
  }

  function renderAction(action) {
    return `<li><span>${esc(action.priority)}</span><div><b>${esc(action.action)}</b><p><strong>السبب:</strong> ${esc(action.why_now || "غير موضح")}</p><p><strong>المخرج:</strong> ${esc(action.output || "غير موضح")}</p><small>${esc(action.owner_role || "الباحث أو الفريق")}${action.due_date ? ` · ${esc(action.due_date)}` : ""}</small></div></li>`;
  }

  function renderMatchResults({ opportunity, assessment, meta }) {
    stopElapsedTimer();
    requestInFlight = false;
    const identity = opportunity.identity || {};
    const readiness = assessment.readiness || {};
    const eligibility = assessment.eligibility || {};
    const tone = match().decisionTone(eligibility.status);
    const gates = items(assessment.hard_gates);
    const gateSummary = match().gateSummary(gates);
    const gaps = items(assessment.gaps);
    const actions = items(assessment.action_plan);
    const packageItems = items(assessment.application_package);
    const dimensions = items(assessment.fit_dimensions);
    const review = assessment.institutional_review || {};
    const quality = assessment.quality_review || {};
    const evidenceLedger = items(quality.evidence_ledger);
    const contradictions = items(quality.contradictions);
    const topGap = gaps[0] || {};
    const topAction = actions[0] || {};
    const truncated = Boolean(meta?.opportunity?.input_truncated || meta?.project?.input_truncated || meta?.assessment?.input_truncated);
    const fixedDisclaimer = "هذا التقييم عام واستـرشادي ولا يضمن القبول أو التمويل. قد تتطلب الفرصة شروطًا إضافية تتعلق بالتخصص أو الشريك أو الجاهزية التقنية أو الملكية الفكرية أو التراخيص. المصدر الرسمي وقرار الجهة الممولة هما المرجع النهائي.";

    root().innerHTML = `${header('<button id="new" class="rafid-text-button" type="button">تحليل جديد</button>')}
      <section class="match-report">
        <div class="match-report-heading"><div><span class="rafid-kicker">نتيجة المطابقة لفرصة محددة</span><h1>${esc(identity.title || "فرصة غير مسماة")}</h1><p>${esc(identity.funder || "الجهة غير موضحة")}${identity.deadline ? ` · الإغلاق ${esc(identity.deadline)}` : ""}</p></div><span class="eligibility-badge ${tone}">${esc(eligibility.status || "غير محسوم")}</span></div>
        <article class="decision-card ${tone}"><div><span>قرار الأهلية الاسترشادي</span><h2>${esc(eligibility.status || "غير محسوم")}</h2><p>${esc(eligibility.reason || readiness.summary || "تحتاج النتيجة إلى مراجعة بشرية.")}</p></div><div class="decision-recommendation"><span>توصية المراجعة</span><b>${esc(review.recommendation || "تحتاج مراجعة بشرية")}</b><p>${esc(review.rationale || "راجع الأدلة والشروط قبل القرار.")}</p></div></article>
        ${truncated ? '<p class="rafid-notice">تم اختصار جزء من أحد المدخلات بسبب حد المعالجة. خفّض رافد الثقة، ويُنصح بإعادة التحليل بنص مركز أو تقسيم المستند.</p>' : ""}
        <section class="report-command" aria-label="الخلاصة التنفيذية"><article><span>أهم فجوة الآن</span><b>${esc(topGap.title || "مراجعة شروط الأهلية")}</b><p>${esc(topGap.required_action || "تحقق من المصدر الرسمي قبل اتخاذ القرار.")}</p></article><article><span>الإجراء التالي</span><b>${esc(topAction.action || "استكمال الأدلة الناقصة")}</b><p>${esc(topAction.output || "ملف موثق وقابل للمراجعة")}</p></article><article><span>المراجعة البشرية</span><b>${review.institutional_review_required === false ? "موصى بها" : "مطلوبة"}</b><p>${esc(review.recommendation || "راجع الحكم مع مسؤول البرنامج.")}</p></article></section>
        <nav class="report-nav" aria-label="أقسام التقرير"><a href="#gates">الأهلية</a><a href="#fit">الملاءمة</a><a href="#quality">الأدلة والتدقيق</a><a href="#gaps">الفجوات</a><a href="#actions">خطة العمل</a><a href="#package">حزمة التقديم</a></nav>
        <div class="match-scores">
          <article><div class="score-ring" style="--score:${clamp(readiness.opportunity_readiness_score)}" role="img" aria-label="الملاءمة والجاهزية ${clamp(readiness.opportunity_readiness_score)} من 100"><b>${clamp(readiness.opportunity_readiness_score)}<small>/100</small></b></div><span>الملاءمة والجاهزية</span><small>بعد احتساب الأهلية والأدلة</small></article>
          <article><div class="score-ring" style="--score:${clamp(readiness.evidence_strength_score)}" role="img" aria-label="قوة الأدلة ${clamp(readiness.evidence_strength_score)} من 100"><b>${clamp(readiness.evidence_strength_score)}<small>/100</small></b></div><span>قوة الأدلة</span><small>مدى دعم البحث لشروط الفرصة</small></article>
          <article><div class="score-ring" style="--score:${clamp(readiness.assessment_confidence)}" role="img" aria-label="ثقة التحليل ${clamp(readiness.assessment_confidence)} من 100"><b>${clamp(readiness.assessment_confidence)}<small>/100</small></b></div><span>ثقة التحليل</span><small>تتأثر باكتمال ووضوح النص</small></article>
        </div>
        <section id="gates" class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">الأهلية قبل الدرجة</span><h2>الشروط الصارمة</h2></div><p>${gateSummary.total} شروط · ${gateSummary.met} مستوفاة · ${gateSummary.partial} جزئية · ${gateSummary.missing} غير مستوفاة · ${gateSummary.unknown} غير محسومة</p></div><div class="match-gates">${gates.length ? gates.map(renderGate).join("") : '<p class="empty-value">لم تُستخرج شروط أهلية صارمة؛ يلزم فحص المصدر يدويًا.</p>'}</div></section>
        <section id="fit" class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">بعد الأهلية</span><h2>أبعاد الملاءمة</h2></div><p>الأوزان ثابتة ومجموعها 100</p></div><div class="fit-grid">${dimensions.length ? dimensions.map((dimension) => `<article><div><b>${esc(dimension.dimension)}</b><span>${clamp(dimension.score)}/100</span></div><p>${esc(dimension.rationale || "غير موضح")}</p><small><b>الوزن:</b> ${esc(dimension.weight_percent)}% · <b>التحسين:</b> ${esc(dimension.improvement || "لا يوجد اقتراح محدد")}</small></article>`).join("") : '<p class="empty-value">لم تتوفر أبعاد ملاءمة كافية.</p>'}</div></section>
        <section id="quality" class="match-section quality-review"><div class="match-section-heading"><div><span class="rafid-kicker">مراجع ثانٍ مستقل عن صياغة النموذج</span><h2>الأدلة والتناقضات</h2></div><p>${quality.second_review_passed ? "اكتمل التحقق" : "يحتاج تحقق"} · ${Number(quality.corrections_count || 0)} تصحيحات · ${contradictions.length} تناقضات</p></div><div class="quality-summary"><article><span>طريقة الدرجة</span><b>${esc(quality.score_method || "غير موضح")}</b></article><article><span>تغطية الأدلة</span><b>${clamp(quality.evidence_coverage_score)}/100</b></article><article><span>إصدار الـRubric</span><b>${esc(quality.rubric_version || "غير موضح")}</b></article></div>${items(quality.corrections).length ? `<details open><summary>تصحيحات المراجع الثاني</summary>${safeList(quality.corrections)}</details>` : '<p class="quality-ok">✓ لم يعتمد المراجع الثاني حكم استيفاء بلا دليل.</p>'}<details ${contradictions.length ? "open" : ""}><summary>التناقضات التي تحتاج حسمًا (${contradictions.length})</summary>${contradictions.length ? `<div class="contradiction-list">${contradictions.map((item) => `<article><b>${esc(item.topic)}</b><p>${esc(item.first_statement)} ↔ ${esc(item.conflicting_statement)}</p><small>${esc(item.clarification_needed)}</small></article>`).join("")}</div>` : '<p class="empty-value">لم يكتشف الفحص الحتمي تناقضًا مباشرًا في البيانات المنظمة.</p>'}</details><details><summary>سجل الأدلة القابلة للمراجعة (${evidenceLedger.length})</summary>${evidenceLedger.length ? `<div class="evidence-ledger">${evidenceLedger.map((item) => `<article><span>${esc(item.category)}</span><b>${esc(item.statement)}</b><small>${esc(item.strength)} · ${esc(item.source)}</small></article>`).join("")}</div>` : '<p class="empty-value">لم تتوفر أدلة موثقة كافية؛ لذلك خُفضت قوة الأدلة والثقة.</p>'}</details></section>
        <section id="gaps" class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">ما يمنع أو يؤخر التقديم</span><h2>الفجوات</h2></div></div><div class="match-gap-grid">${gaps.length ? gaps.map((gap) => `<article class="severity-${esc(gap.severity)}"><span>${esc(gap.severity)}</span><h3>${esc(gap.title)}</h3><p>${esc(gap.current_state || "غير موضح")}</p><dl><dt>المطلوب</dt><dd>${esc(gap.required_action || "غير موضح")}</dd><dt>معيار الإغلاق</dt><dd>${esc(gap.completion_criterion || "غير موضح")}</dd></dl></article>`).join("") : '<p class="empty-value">لم تُسجل فجوات، لكن تبقى المراجعة البشرية مطلوبة.</p>'}</div></section>
        <section id="actions" class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">بالترتيب</span><h2>خطة إغلاق الفجوات</h2></div></div><ol class="match-actions">${actions.length ? actions.map(renderAction).join("") : '<li><span>١</span><div><b>راجع المصدر الرسمي</b><p>لم تتوفر إجراءات منظمة كافية.</p></div></li>'}</ol></section>
        <section id="package" class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">قبل الإرسال</span><h2>حزمة التقديم</h2></div></div><div class="package-grid match-package">${packageItems.length ? packageItems.map((entry) => `<article><span class="package-status ${statusClass(entry.status === "جاهز" ? "مستوفى" : entry.status === "ناقص" ? "غير مستوفى" : "غير معروف")}">${esc(entry.status)}</span><b>${esc(entry.document_name)}</b><p>${esc(entry.available_evidence || "لا يتوفر دليل واضح")}</p><small>${esc(entry.next_action || "راجع متطلبات الوثيقة")}</small></article>`).join("") : '<p class="empty-value">لم تُستخرج قائمة وثائق واضحة.</p>'}</div></section>
        <section class="match-section questions-grid"><div><h2>أسئلة للفريق</h2>${safeList(review.questions_for_project_team)}</div><div><h2>أسئلة للجهة الممولة</h2>${safeList(review.questions_for_funder)}</div></section>
        <p class="rafid-notice match-disclaimer">${fixedDisclaimer}</p>
        <div class="form-actions report-actions"><button id="copy" class="rafid-secondary" type="button">نسخ الخلاصة</button><button id="download" class="rafid-secondary" type="button">تنزيل تقرير مقروء</button><button id="print" class="rafid-primary" type="button">طباعة التقرير</button><button id="newBottom" class="rafid-text-button" type="button">بدء تحليل جديد</button></div>
        <p id="copyStatus" role="status" class="copy-status"></p>
      </section>`;
    const restart = () => matchView();
    root().querySelector("#new").addEventListener("click", restart);
    root().querySelector("#newBottom").addEventListener("click", restart);
    root().querySelector("#print").addEventListener("click", () => window.print());
    root().querySelector("#download").addEventListener("click", () => {
      const report = root().querySelector(".match-report");
      const blob = new Blob([report?.innerText || match().summaryText(assessment)], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rafid-opportunity-report-${new Date().toISOString().slice(0, 10)}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    });
    root().querySelector("#copy").addEventListener("click", async () => {
      const status = root().querySelector("#copyStatus");
      try {
        await navigator.clipboard.writeText(match().summaryText(assessment));
        status.textContent = "نُسخت خلاصة الملاءمة.";
      } catch {
        status.textContent = "تعذر النسخ تلقائيًا؛ استخدم تحديد النص ونسخه.";
      }
    });
    resetView();
  }

  function generalView() {
    const main = root();
    const maxSize = Number(runtime.limits?.max_file_size_mb || 20);
    main.innerHTML = `${header('<button id="back" class="rafid-text-button" type="button">العودة للخدمات</button>')}
      <section class="single-analysis-shell"><div class="single-analysis-intro"><span class="rafid-kicker">تحليل الجاهزية العامة</span><h1 tabindex="-1">أضف بحثك، واترك الباقي لرافد</h1><p>ارفع ملفًا واحدًا أو عدة ملفات، أو الصق النص. ستحصل على تقييم تقني وتمويلي مفسر وخطة تحسين واضحة.</p><div class="analysis-facts"><span>دون تسجيل دخول</span><span>حتى 5 ملفات</span><span>لا حفظ افتراضي</span></div><button id="goIntro" class="rafid-primary intro-submit" type="button" disabled>أضف محتوى للبدء</button></div>
      <div class="form-card institutional-upload-card"><div class="source-choice-grid"><label id="generalDrop" class="file-picker drop-zone"><input id="file" type="file" accept=".pdf,.docx,.txt,.md" multiple /><span class="drop-icon" aria-hidden="true">⇧</span><b>اسحب ملفات البحث هنا</b><small id="textHint">حتى 5 ملفات: PDF · DOCX · TXT · MD، كل ملف حتى ${maxSize}MB</small></label><div class="choice-divider"><span>أو</span></div><label class="paste-source" for="text"><b>الصق نص البحث</b><textarea id="text" rows="12" aria-describedby="count textHint" placeholder="ألصق ملخص البحث أو المسودة أو محتوى المشروع هنا…"></textarea><span id="count">0 حرف</span></label></div>
      <div class="analysis-output-preview"><b>سيشمل التقرير</b><span>الجاهزية التقنية</span><span>الجاهزية التمويلية</span><span>الفجوات الحرجة</span><span>خطة العمل</span></div>
      <p class="rafid-notice">التقييم استرشادي، وقد تختلف الشروط بين فرص التمويل. راجع الجهة الممولة قبل التقديم.</p><p id="error" class="rafid-error" role="alert"></p><div class="form-actions sticky-submit"><button id="go" class="rafid-primary" type="button">ابدأ تحليل الجاهزية</button><button id="cancel" class="rafid-secondary" type="button" hidden>إلغاء التحليل</button></div><small class="submit-privacy">بالبدء توافق على معالجة المحتوى لهذا الطلب فقط وفق سياسة الخصوصية.</small></div></section>`;
    main.querySelector("#back").addEventListener("click", app);
    const text = main.querySelector("#text");
    const file = main.querySelector("#file");
    const error = main.querySelector("#error");
    const go = main.querySelector("#go");
    const goIntro = main.querySelector("#goIntro");
    const cancel = main.querySelector("#cancel");
    const updateGeneralAction = () => { const ready = text.value.trim().length >= 30 || file.files.length > 0; goIntro.disabled = !ready; goIntro.textContent = ready ? "ابدأ تحليل الجاهزية" : "أضف محتوى للبدء"; };
    text.addEventListener("input", () => { main.querySelector("#count").textContent = `${text.value.length} حرف`; updateGeneralAction(); });
    file.addEventListener("change", () => { const selected = Array.from(file.files || []); if (selected.length) main.querySelector("#textHint").textContent = selected.length === 1 ? `تم اختيار: ${selected[0].name}` : `تم اختيار ${selected.length} ملفات`; updateGeneralAction(); });
    bindDropZone(file, main.querySelector("#generalDrop"));
    goIntro.addEventListener("click", () => go.click());
    go.addEventListener("click", async () => {
      if (requestInFlight) return;
      try {
        const source = await readSource(text, file, "البحث", { maxFiles: 5 });
        if (source.text.length < 30) throw new Error("أدخل 30 حرفًا على الأقل من البحث.");
        requestInFlight = true;
        go.disabled = true;
        cancel.hidden = false;
        error.classList.remove("is-error");
        error.textContent = "قراءة المحتوى… تحليل العناصر… تقييم الجاهزية… إعداد التوصيات…";
        controller = new AbortController();
        const data = await callApi("research/analyze", { text: source.text }, controller.signal);
        generalResults(data.result, data.meta);
      } catch (errorValue) {
        error.textContent = errorValue.name === "AbortError" ? "أُلغي التحليل. يمكنك المحاولة مجددًا." : errorValue.message;
        error.classList.add("is-error");
        requestInFlight = false;
        go.disabled = false;
        cancel.hidden = true;
      }
    });
    cancel.addEventListener("click", () => controller?.abort());
    resetView();
  }

  function generalResults(result, meta = {}) {
    requestInFlight = false;
    const dimensions = items(result.technicalReadiness?.dimensions).map((dimension) => `<li><b>${esc(dimension.id)}</b><span>${esc(dimension.explanation)}</span></li>`).join("");
    const truncationNotice = meta.truncated ? '<p class="rafid-notice">تم تحليل الجزء المقبول من المستند الطويل فقط؛ أعد التحليل على ملخص مركز للحصول على تغطية أوسع.</p>' : "";
    root().innerHTML = `${header('<button id="new" class="rafid-text-button" type="button">تحليل جديد</button>')}<section class="rafid-report"><span class="rafid-kicker">نتيجة التقييم العام</span><h1>جاهزية البحث</h1><p class="report-summary">${esc(result.researchSummary || "غير موضح")}</p>${truncationNotice}<div class="scores"><article><span>الجاهزية التقنية</span><meter min="0" max="100" value="${clamp(result.technicalReadiness?.score)}"></meter><b>${clamp(result.technicalReadiness?.score)}<small>/100</small></b></article><article><span>الجاهزية التمويلية</span><meter min="0" max="100" value="${clamp(result.fundingReadiness?.score)}"></meter><b>${clamp(result.fundingReadiness?.score)}<small>/100</small></b></article></div><p class="confidence">مستوى الثقة: <b>${esc(result.confidence || "منخفض")}</b></p><details open><summary>تفسير الدرجات</summary><ul class="dimension-list">${dimensions}</ul></details><details><summary>النواقص الحرجة</summary>${safeList(result.criticalGaps)}</details><details><summary>خطة العمل</summary>${safeList(result.actionPlan)}</details><p class="rafid-notice">${esc(result.fundingDisclaimer || "هذا التحليل إرشادي ولا يضمن الحصول على تمويل.")}</p><div class="form-actions"><button id="copy" class="rafid-secondary" type="button">نسخ الملخص</button><button id="print" class="rafid-primary" type="button">طباعة التقرير</button></div></section>`;
    root().querySelector("#new").addEventListener("click", generalView);
    root().querySelector("#copy").addEventListener("click", () => navigator.clipboard?.writeText(result.researchSummary || ""));
    root().querySelector("#print").addEventListener("click", () => window.print());
    resetView();
  }

  window.addEventListener("DOMContentLoaded", () => {
    app();
    void loadRuntime();
  });
  document.addEventListener("click", (event) => {
    const logo = event.target.closest?.(".rafid-logo");
    if (!logo) return;
    event.preventDefault();
    if (location.hash !== "#home") history.pushState(null, "", "#home");
    app();
  });
  window.RafidApp = Object.freeze({ home: app, general: generalView, match: matchView });
})();
