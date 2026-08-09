"use strict";

(() => {
  let controller;
  let requestInFlight = false;
  let runtime = { auth: { enabled: false, required: false }, limits: { max_file_size_mb: 20 } };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const root = () => document.querySelector(".rafid");
  const match = () => window.RafidOpportunityMatch;
  const items = (value) => Array.isArray(value) ? value : [];
  const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

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
      <a class="rafid-logo" href="#" aria-label="رافد، الصفحة الرئيسية"><span>ر</span><b>رافد</b></a>
      ${action}
    </header>`;
  }

  function app() {
    document.querySelector(".topbar")?.setAttribute("hidden", "");
    document.querySelector(".app-shell")?.setAttribute("hidden", "");
    const existing = root();
    if (existing) existing.remove();
    const main = document.createElement("main");
    main.className = "rafid";
    main.innerHTML = `${header('<nav aria-label="روابط رافد"><a href="#how">طريقة الاستخدام</a><a href="#privacy">الخصوصية</a><a href="#terms">الشروط</a></nav>')}
      <section class="hero">
        <span class="rafid-kicker">تحليل بحثي عربي · خاص افتراضيًا</span>
        <h1>اعرف مدى ملاءمة بحثك لفرصة التمويل</h1>
        <p>قارن البحث بشروط فرصة محددة، افحص الأهلية والأدلة، واحصل على خطة عملية لإغلاق الفجوات قبل التقديم.</p>
        <div class="hero-actions">
          <button id="startMatch" class="rafid-primary" type="button">قارن بحثك بفرصة <span aria-hidden="true">←</span></button>
          <button id="startGeneral" class="rafid-hero-secondary" type="button">تقييم جاهزية عام</button>
        </div>
        <small class="hero-privacy">لا نطلب اسم الباحث، ولا نحفظ نص البحث أو ملف الفرصة افتراضيًا.</small>
        <div class="hero-orbs" aria-hidden="true"><i></i><i></i><i></i></div>
      </section>
      <section id="how" class="rafid-steps" aria-label="كيف يعمل رافد">
        <article><span>١</span><b>أدخل الفرصة</b><p>ألصق شروطها أو ارفع ملفها الرسمي.</p></article>
        <article><span>٢</span><b>أضف البحث</b><p>ألصق النص أو ارفع PDF أو DOCX أو TXT.</p></article>
        <article><span>٣</span><b>راجع القرار</b><p>شاهد الأهلية والملاءمة والأدلة وخطة الإغلاق.</p></article>
      </section>
      <section class="rafid-benefits"><div><span class="rafid-kicker">ما ستحصل عليه</span><h2>قرار أوضح قبل استهلاك وقت التقديم</h2></div><ul><li>بوابات الأهلية</li><li>درجة ملاءمة مفسّرة</li><li>الأدلة المفقودة</li><li>خطة تجهيز الطلب</li></ul></section>
      <footer><p id="privacy">النتائج استرشادية، ولا تضمن القبول أو التمويل. راجع المصدر الرسمي قبل التقديم.</p><a id="terms" href="#terms">شروط الاستخدام</a></footer>`;
    document.body.prepend(main);
    main.querySelector("#startMatch").addEventListener("click", matchView);
    main.querySelector("#startGeneral").addEventListener("click", generalView);
  }

  async function readSource(textInput, fileInput, label) {
    const typed = textInput.value.trim();
    const file = fileInput.files[0];
    if (typed && file) throw new Error(`اختر لصق نص ${label} أو رفع ملفه، وليس الاثنين معًا.`);
    if (!typed && !file) throw new Error(`أدخل نص ${label} أو اختر ملفًا.`);
    if (!file) return { text: typed, file: null, sourceName: "نص أدخله المستخدم" };
    const documentData = await window.RafidIngest.read(file, {
      maxFileSizeMb: runtime.limits?.max_file_size_mb || 20,
    });
    return {
      text: documentData.fullText,
      file,
      sourceName: documentData.displayName || file.name,
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
      const error = new Error(payload.error || "تعذر إكمال التحليل الآن.");
      error.code = payload.code || "RAFID_REQUEST_FAILED";
      throw error;
    }
    return payload;
  }

  function setFileStatus(main, input, target, defaultText) {
    input.addEventListener("change", () => {
      target.textContent = input.files[0] ? `تم اختيار: ${input.files[0].name}` : defaultText;
    });
  }

  function matchView() {
    const main = root();
    const maxSize = Number(runtime.limits?.max_file_size_mb || 20);
    main.innerHTML = `${header('<button id="back" class="rafid-text-button" type="button">الرئيسية</button>')}
      <section class="match-intro">
        <span class="rafid-kicker">تحليل الملاءمة لفرصة محددة</span>
        <h1>الفرصة أولًا، ثم البحث</h1>
        <p>يفصل رافد بين شروط الأهلية الصارمة ومعايير المفاضلة. الدرجة المرتفعة لا تتجاوز شرطًا مانعًا.</p>
      </section>
      <section class="match-form" aria-labelledby="matchFormTitle">
        <h2 id="matchFormTitle" class="sr-only">بيانات فرصة التمويل والبحث</h2>
        <article class="match-input-card opportunity-input">
          <div class="match-card-heading"><span>١</span><div><b>فرصة التمويل</b><small>المصدر الرسمي أو دليل التقديم</small></div></div>
          <div class="match-meta-grid">
            <label>اسم الفرصة <input id="oppTitle" autocomplete="off" placeholder="مثال: برنامج دعم الابتكار" /></label>
            <label>الجهة الممولة (اختياري) <input id="oppFunder" autocomplete="off" placeholder="اسم الجهة كما ورد" /></label>
            <label>رابط المصدر الرسمي (اختياري) <input id="oppUrl" type="url" dir="ltr" inputmode="url" placeholder="https://…" /></label>
            <label>موعد الإغلاق (اختياري) <input id="oppDeadline" type="date" /></label>
          </div>
          <label>نص الفرصة<textarea id="oppText" rows="8" aria-describedby="oppCount oppHint" placeholder="ألصق شروط الأهلية ومعايير التقييم والوثائق المطلوبة…"></textarea></label>
          <div class="form-meta"><span id="oppCount">0 حرف</span><span id="oppHint">أو ارفع ملفًا واحدًا</span></div>
          <label class="file-picker">رفع ملف الفرصة<input id="oppFile" type="file" accept=".pdf,.docx,.txt" /><span id="oppFileStatus">PDF · DOCX · TXT حتى ${maxSize}MB</span></label>
        </article>
        <article class="match-input-card research-input">
          <div class="match-card-heading"><span>٢</span><div><b>البحث أو المشروع</b><small>لا نطلب اسم الباحث أو معلومات شخصية</small></div></div>
          <label>عنوان مختصر (اختياري)<input id="projectTitle" autocomplete="off" placeholder="اسم البحث أو المشروع" /></label>
          <label>نص البحث<textarea id="researchText" rows="10" aria-describedby="researchCount researchHint" placeholder="ألصق الملخص أو المسودة أو محتوى المشروع…"></textarea></label>
          <div class="form-meta"><span id="researchCount">0 حرف</span><span id="researchHint">أو ارفع ملفًا واحدًا</span></div>
          <label class="file-picker">رفع ملف البحث<input id="researchFile" type="file" accept=".pdf,.docx,.txt" /><span id="researchFileStatus">PDF · DOCX · TXT حتى ${maxSize}MB</span></label>
        </article>
        <article class="match-consent-card">
          <h2>قبل التحليل</h2>
          <ul><li>التحليل استرشادي ولا يضمن التمويل.</li><li>قد تختلف الشروط عن النسخة المدخلة؛ راجع المصدر الرسمي.</li><li>لا ترفع معلومات شديدة الحساسية أو بيانات مشاركين.</li></ul>
          <label class="match-confirm"><input id="privacyConfirmMatch" type="checkbox" /><span>أوافق على معالجة نص الفرصة والبحث لهذا الطلب فقط، دون حفظهما افتراضيًا.</span></label>
          <div id="matchProgress" class="match-progress" hidden aria-live="polite">
            <span data-stage="opportunity">استخراج شروط الفرصة</span>
            <span data-stage="research">تحليل البحث والأدلة</span>
            <span data-stage="assessment">مطابقة الأهلية والملاءمة</span>
            <span data-stage="report">إعداد خطة الإغلاق</span>
          </div>
          <p id="error" class="rafid-error" role="alert"></p>
          <div class="form-actions"><button id="go" class="rafid-primary" type="button">حلّل الملاءمة للفرصة</button><button id="cancel" class="rafid-secondary" type="button" hidden>إلغاء التحليل</button></div>
        </article>
      </section>`;

    main.querySelector("#back").addEventListener("click", app);
    const oppText = main.querySelector("#oppText");
    const researchText = main.querySelector("#researchText");
    const oppFile = main.querySelector("#oppFile");
    const researchFile = main.querySelector("#researchFile");
    oppText.addEventListener("input", () => { main.querySelector("#oppCount").textContent = `${oppText.value.length} حرف`; });
    researchText.addEventListener("input", () => { main.querySelector("#researchCount").textContent = `${researchText.value.length} حرف`; });
    setFileStatus(main, oppFile, main.querySelector("#oppFileStatus"), `PDF · DOCX · TXT حتى ${maxSize}MB`);
    setFileStatus(main, researchFile, main.querySelector("#researchFileStatus"), `PDF · DOCX · TXT حتى ${maxSize}MB`);
    main.querySelector("#go").addEventListener("click", runMatch);
    main.querySelector("#cancel").addEventListener("click", () => controller?.abort());
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

      setStage("opportunity");
      const [opportunitySource, researchSource] = await Promise.all([
        readSource(main.querySelector("#oppText"), main.querySelector("#oppFile"), "الفرصة"),
        readSource(main.querySelector("#researchText"), main.querySelector("#researchFile"), "البحث"),
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
      const opportunityResponse = await callApi("opportunity/extract", opportunityRequest, controller.signal);

      setStage("research");
      const projectRequest = match().buildProjectRequest({
        researchText: researchSource.text,
        projectTitle: main.querySelector("#projectTitle").value,
        projectFiles: researchSource.file ? [researchSource.file] : [],
        privacy,
      });
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
      errorNode.textContent = errorValue.name === "AbortError" ? "أُلغي التحليل. بقيت المدخلات لتستطيع المحاولة مجددًا." : errorValue.message;
      errorNode.classList.add("is-error");
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
    const truncated = Boolean(meta?.opportunity?.input_truncated || meta?.project?.input_truncated || meta?.assessment?.input_truncated);
    const fixedDisclaimer = "هذا التقييم عام واستـرشادي ولا يضمن القبول أو التمويل. قد تتطلب الفرصة شروطًا إضافية تتعلق بالتخصص أو الشريك أو الجاهزية التقنية أو الملكية الفكرية أو التراخيص. المصدر الرسمي وقرار الجهة الممولة هما المرجع النهائي.";

    root().innerHTML = `${header('<button id="new" class="rafid-text-button" type="button">تحليل جديد</button>')}
      <section class="match-report">
        <div class="match-report-heading"><div><span class="rafid-kicker">نتيجة المطابقة لفرصة محددة</span><h1>${esc(identity.title || "فرصة غير مسماة")}</h1><p>${esc(identity.funder || "الجهة غير موضحة")}${identity.deadline ? ` · الإغلاق ${esc(identity.deadline)}` : ""}</p></div><span class="eligibility-badge ${tone}">${esc(eligibility.status || "غير محسوم")}</span></div>
        <article class="decision-card ${tone}"><div><span>قرار الأهلية الاسترشادي</span><h2>${esc(eligibility.status || "غير محسوم")}</h2><p>${esc(eligibility.reason || readiness.summary || "تحتاج النتيجة إلى مراجعة بشرية.")}</p></div><div class="decision-recommendation"><span>توصية المراجعة</span><b>${esc(review.recommendation || "تحتاج مراجعة بشرية")}</b><p>${esc(review.rationale || "راجع الأدلة والشروط قبل القرار.")}</p></div></article>
        ${truncated ? '<p class="rafid-notice">تم اختصار جزء من أحد المدخلات بسبب حد المعالجة. خفّض رافد الثقة، ويُنصح بإعادة التحليل بنص مركز أو تقسيم المستند.</p>' : ""}
        <div class="match-scores">
          <article><span>الملاءمة والجاهزية</span><meter min="0" max="100" value="${clamp(readiness.opportunity_readiness_score)}"></meter><b>${clamp(readiness.opportunity_readiness_score)}<small>/100</small></b></article>
          <article><span>قوة الأدلة</span><meter min="0" max="100" value="${clamp(readiness.evidence_strength_score)}"></meter><b>${clamp(readiness.evidence_strength_score)}<small>/100</small></b></article>
          <article><span>ثقة التحليل</span><meter min="0" max="100" value="${clamp(readiness.assessment_confidence)}"></meter><b>${clamp(readiness.assessment_confidence)}<small>/100</small></b></article>
        </div>
        <section class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">الأهلية قبل الدرجة</span><h2>الشروط الصارمة</h2></div><p>${gateSummary.total} شروط · ${gateSummary.met} مستوفاة · ${gateSummary.partial} جزئية · ${gateSummary.missing} غير مستوفاة · ${gateSummary.unknown} غير محسومة</p></div><div class="match-gates">${gates.length ? gates.map(renderGate).join("") : '<p class="empty-value">لم تُستخرج شروط أهلية صارمة؛ يلزم فحص المصدر يدويًا.</p>'}</div></section>
        <section class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">بعد الأهلية</span><h2>أبعاد الملاءمة</h2></div></div><div class="fit-grid">${dimensions.length ? dimensions.map((dimension) => `<article><div><b>${esc(dimension.dimension)}</b><span>${clamp(dimension.score)}/100</span></div><p>${esc(dimension.rationale || "غير موضح")}</p><small><b>التحسين:</b> ${esc(dimension.improvement || "لا يوجد اقتراح محدد")}</small></article>`).join("") : '<p class="empty-value">لم تتوفر أبعاد ملاءمة كافية.</p>'}</div></section>
        <section class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">ما يمنع أو يؤخر التقديم</span><h2>الفجوات</h2></div></div><div class="match-gap-grid">${gaps.length ? gaps.map((gap) => `<article class="severity-${esc(gap.severity)}"><span>${esc(gap.severity)}</span><h3>${esc(gap.title)}</h3><p>${esc(gap.current_state || "غير موضح")}</p><dl><dt>المطلوب</dt><dd>${esc(gap.required_action || "غير موضح")}</dd><dt>معيار الإغلاق</dt><dd>${esc(gap.completion_criterion || "غير موضح")}</dd></dl></article>`).join("") : '<p class="empty-value">لم تُسجل فجوات، لكن تبقى المراجعة البشرية مطلوبة.</p>'}</div></section>
        <section class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">بالترتيب</span><h2>خطة إغلاق الفجوات</h2></div></div><ol class="match-actions">${actions.length ? actions.map(renderAction).join("") : '<li><span>١</span><div><b>راجع المصدر الرسمي</b><p>لم تتوفر إجراءات منظمة كافية.</p></div></li>'}</ol></section>
        <section class="match-section"><div class="match-section-heading"><div><span class="rafid-kicker">قبل الإرسال</span><h2>حزمة التقديم</h2></div></div><div class="package-grid match-package">${packageItems.length ? packageItems.map((entry) => `<article><span class="package-status ${statusClass(entry.status === "جاهز" ? "مستوفى" : entry.status === "ناقص" ? "غير مستوفى" : "غير معروف")}">${esc(entry.status)}</span><b>${esc(entry.document_name)}</b><p>${esc(entry.available_evidence || "لا يتوفر دليل واضح")}</p><small>${esc(entry.next_action || "راجع متطلبات الوثيقة")}</small></article>`).join("") : '<p class="empty-value">لم تُستخرج قائمة وثائق واضحة.</p>'}</div></section>
        <section class="match-section questions-grid"><div><h2>أسئلة للفريق</h2>${safeList(review.questions_for_project_team)}</div><div><h2>أسئلة للجهة الممولة</h2>${safeList(review.questions_for_funder)}</div></section>
        <p class="rafid-notice match-disclaimer">${fixedDisclaimer}</p>
        <div class="form-actions report-actions"><button id="copy" class="rafid-secondary" type="button">نسخ الخلاصة</button><button id="print" class="rafid-primary" type="button">طباعة التقرير</button><button id="newBottom" class="rafid-text-button" type="button">بدء تحليل جديد</button></div>
        <p id="copyStatus" role="status" class="copy-status"></p>
      </section>`;
    const restart = () => matchView();
    root().querySelector("#new").addEventListener("click", restart);
    root().querySelector("#newBottom").addEventListener("click", restart);
    root().querySelector("#print").addEventListener("click", () => window.print());
    root().querySelector("#copy").addEventListener("click", async () => {
      const status = root().querySelector("#copyStatus");
      try {
        await navigator.clipboard.writeText(match().summaryText(assessment));
        status.textContent = "نُسخت خلاصة الملاءمة.";
      } catch {
        status.textContent = "تعذر النسخ تلقائيًا؛ استخدم تحديد النص ونسخه.";
      }
    });
  }

  function generalView() {
    const main = root();
    main.innerHTML = `${header('<button id="back" class="rafid-text-button" type="button">الرئيسية</button>')}
      <section class="rafid-form-shell"><div class="form-intro"><span class="rafid-kicker">تقييم عام</span><h1>حلّل جاهزية البحث</h1><p>هذا المسار لا يقارن البحث بفرصة بعينها. استخدمه لاكتشاف النواقص العامة قبل اختيار فرصة التمويل.</p></div><div class="form-card">
      <label for="text">لصق النص<textarea id="text" rows="10" aria-describedby="count textHint" placeholder="ألصق ملخص البحث أو مسودته هنا…"></textarea></label><div class="form-meta"><span id="count">0 حرف</span><span id="textHint">أو اختر ملفًا واحدًا بدل النص</span></div>
      <label class="file-picker">رفع ملف<input id="file" type="file" accept=".pdf,.docx,.txt" /><span>PDF · DOCX · TXT</span></label><p class="rafid-notice">التقييم استرشادي، والشروط تختلف بين فرص التمويل، والنتيجة لا تضمن التمويل.</p><p id="error" class="rafid-error" role="alert"></p><div class="form-actions"><button id="go" class="rafid-primary" type="button">حلّل الجاهزية العامة</button><button id="cancel" class="rafid-secondary" type="button" hidden>إلغاء التحليل</button></div></div></section>`;
    main.querySelector("#back").addEventListener("click", app);
    const text = main.querySelector("#text");
    const file = main.querySelector("#file");
    const error = main.querySelector("#error");
    const go = main.querySelector("#go");
    const cancel = main.querySelector("#cancel");
    text.addEventListener("input", () => { main.querySelector("#count").textContent = `${text.value.length} حرف`; });
    file.addEventListener("change", () => { if (file.files[0]) main.querySelector("#textHint").textContent = `تم اختيار: ${file.files[0].name}`; });
    go.addEventListener("click", async () => {
      if (requestInFlight) return;
      try {
        const source = await readSource(text, file, "البحث");
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
  }

  function generalResults(result, meta = {}) {
    requestInFlight = false;
    const dimensions = items(result.technicalReadiness?.dimensions).map((dimension) => `<li><b>${esc(dimension.id)}</b><span>${esc(dimension.explanation)}</span></li>`).join("");
    const truncationNotice = meta.truncated ? '<p class="rafid-notice">تم تحليل الجزء المقبول من المستند الطويل فقط؛ أعد التحليل على ملخص مركز للحصول على تغطية أوسع.</p>' : "";
    root().innerHTML = `${header('<button id="new" class="rafid-text-button" type="button">تحليل جديد</button>')}<section class="rafid-report"><span class="rafid-kicker">نتيجة التقييم العام</span><h1>جاهزية البحث</h1><p class="report-summary">${esc(result.researchSummary || "غير موضح")}</p>${truncationNotice}<div class="scores"><article><span>الجاهزية التقنية</span><meter min="0" max="100" value="${clamp(result.technicalReadiness?.score)}"></meter><b>${clamp(result.technicalReadiness?.score)}<small>/100</small></b></article><article><span>الجاهزية التمويلية</span><meter min="0" max="100" value="${clamp(result.fundingReadiness?.score)}"></meter><b>${clamp(result.fundingReadiness?.score)}<small>/100</small></b></article></div><p class="confidence">مستوى الثقة: <b>${esc(result.confidence || "منخفض")}</b></p><details open><summary>تفسير الدرجات</summary><ul class="dimension-list">${dimensions}</ul></details><details><summary>النواقص الحرجة</summary>${safeList(result.criticalGaps)}</details><details><summary>خطة العمل</summary>${safeList(result.actionPlan)}</details><p class="rafid-notice">${esc(result.fundingDisclaimer || "هذا التحليل إرشادي ولا يضمن الحصول على تمويل.")}</p><div class="form-actions"><button id="copy" class="rafid-secondary" type="button">نسخ الملخص</button><button id="print" class="rafid-primary" type="button">طباعة التقرير</button></div></section>`;
    root().querySelector("#new").addEventListener("click", generalView);
    root().querySelector("#copy").addEventListener("click", () => navigator.clipboard?.writeText(result.researchSummary || ""));
    root().querySelector("#print").addEventListener("click", () => window.print());
  }

  window.addEventListener("DOMContentLoaded", async () => { await loadRuntime(); app(); });
})();
