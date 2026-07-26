"use strict";

(() => {
  let controller;
  let runtime = { auth: { enabled: false, required: false } };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const root = () => document.querySelector(".rafid");

  async function loadRuntime() {
    try {
      const response = await fetch("/api/rafid/public/config", { headers: { Accept: "application/json" } });
      if (response.ok) runtime = await response.json();
    } catch {
      // يبقى التحليل متاحًا في الوضع العام حتى لو تعذر جلب بيانات العرض.
    }
  }

  function showExistingSignIn() {
    const gate = document.querySelector("#authGate");
    if (gate && runtime.auth?.enabled) {
      gate.hidden = false;
      document.querySelector("#authMessage").textContent = "سجّل الدخول للمتابعة ثم ارجع إلى التحليل.";
      return true;
    }
    return false;
  }

  function app() {
    document.querySelector(".topbar")?.setAttribute("hidden", "");
    document.querySelector(".app-shell")?.setAttribute("hidden", "");
    const existing = root();
    if (existing) existing.remove();
    const main = document.createElement("main");
    main.className = "rafid";
    main.innerHTML = `
      <header class="rafid-header">
        <a class="rafid-logo" href="#" aria-label="رافد، الصفحة الرئيسية"><span>ر</span><b>رافد</b></a>
        <nav aria-label="روابط رافد"><a href="#how">طريقة الاستخدام</a><a href="#privacy">الخصوصية</a><a href="#terms">الشروط</a></nav>
      </header>
      <section class="hero">
        <span class="rafid-kicker">تحليل بحثي عربي · خاص افتراضيًا</span>
        <h1>حوّل بحثك إلى مشروع أكثر جاهزية للتمويل</h1>
        <p>حلّل بحثك، اكتشف نقاط القوة والفجوات، واحصل على خطة عملية لتحسين جاهزيته التقنية والتمويلية.</p>
        <div class="hero-actions"><button id="start" class="rafid-primary" type="button">ابدأ التحليل <span aria-hidden="true">←</span></button><small>لا نطلب بيانات شخصية أو حفظًا تلقائيًا للملف.</small></div>
        <div class="hero-orbs" aria-hidden="true"><i></i><i></i><i></i></div>
      </section>
      <section id="how" class="rafid-steps" aria-label="كيف يعمل رافد">
        <article><span>١</span><b>أدخل المحتوى</b><p>ألصق النص أو ارفع ملفًا مقروءًا.</p></article>
        <article><span>٢</span><b>نحلّل العناصر</b><p>نميّز الحقائق والفجوات دون اختلاق.</p></article>
        <article><span>٣</span><b>نفّذ الخطة</b><p>راجع الدرجات والتوصيات العملية.</p></article>
      </section>
      <section class="rafid-benefits"><div><span class="rafid-kicker">ما ستحصل عليه</span><h2>وضوح عملي قبل التقديم</h2></div><ul><li>نقاط القوة</li><li>النواقص المهمة</li><li>درجات جاهزية مفسّرة</li><li>خطة تحسين قابلة للتنفيذ</li></ul></section>
      <footer><p id="privacy">النتائج استرشادية ولا تضمن التمويل. لا يُحفَظ النص أو الملف افتراضيًا.</p><a id="terms" href="#terms">شروط الاستخدام</a></footer>`;
    document.body.prepend(main);
    main.querySelector("#start").addEventListener("click", submitView);
  }

  function submitView() {
    const main = root();
    main.innerHTML = `
      <header class="rafid-header"><a class="rafid-logo" href="#"><span>ر</span><b>رافد</b></a><button id="back" class="rafid-text-button" type="button">الرئيسية</button></header>
      <section class="rafid-form-shell">
        <div class="form-intro"><span class="rafid-kicker">الخطوة الأولى</span><h1>حلّل جاهزية البحث</h1><p>الصق النص أو ارفع PDF أو DOCX أو TXT حتى 20MB. لا نطلب اسم الباحث أو بيانات شخصية.</p></div>
        <div class="form-card">
          <label for="text">لصق النص <textarea id="text" rows="10" aria-describedby="count textHint" placeholder="ألصق ملخص البحث أو مسودته هنا…"></textarea></label>
          <div class="form-meta"><span id="count">0 حرف</span><span id="textHint">أو اختر ملفًا واحدًا بدل النص</span></div>
          <label class="file-picker">رفع ملف <input id="file" type="file" accept=".pdf,.docx,.txt" /><span>PDF · DOCX · TXT</span></label>
          <p class="rafid-notice">التقييم استرشادي، والشروط تختلف بين فرص التمويل، والنتيجة لا تضمن التمويل.</p>
          <div id="authHelp" class="rafid-auth-help" hidden role="status"></div>
          <p id="error" class="rafid-error" role="alert"></p>
          <div class="form-actions"><button id="go" class="rafid-primary" type="button">حلّل جاهزية البحث</button><button id="cancel" class="rafid-secondary" type="button" hidden>إلغاء التحليل</button></div>
        </div>
      </section>`;
    main.querySelector("#back").addEventListener("click", app);
    const text = main.querySelector("#text");
    const file = main.querySelector("#file");
    const error = main.querySelector("#error");
    const go = main.querySelector("#go");
    const cancel = main.querySelector("#cancel");
    text.addEventListener("input", () => { main.querySelector("#count").textContent = `${text.value.length} حرف`; });
    file.addEventListener("change", () => { if (file.files[0]) main.querySelector("#textHint").textContent = `تم اختيار: ${file.files[0].name}`; });
    go.addEventListener("click", async () => {
      try {
        let value = text.value.trim();
        if (file.files[0]) {
          if (value) throw new Error("اختر النص أو الملف فقط.");
          value = (await window.RafidIngest.read(file.files[0], { maxFileSizeMb: runtime.limits?.max_file_size_mb || 20 })).fullText;
        }
        if (!value) throw new Error("أدخل نصًا أو اختر ملفًا.");
        go.disabled = true;
        cancel.hidden = false;
        error.classList.remove("is-error");
        error.textContent = "قراءة المحتوى… تحليل العناصر… تقييم الجاهزية… إعداد التوصيات…";
        controller = new AbortController();
        const response = await fetch("/api/rafid/research/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value }), signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data.code === "RAFID_LOGIN_REQUIRED" || /سجّل الدخول|تسجيل الدخول/i.test(data.error || "")) {
            const help = main.querySelector("#authHelp");
            help.hidden = false;
            if (showExistingSignIn()) help.textContent = "فتحت نافذة الدخول الآمن. أكمل الدخول ثم أعد المحاولة.";
            else help.textContent = "طلب الخادم تسجيل الدخول، لكن هذه النسخة لا تملك مزود دخول مفعّلًا. أعد تحديث الصفحة؛ إن تكرر الأمر فهذه مشكلة إعداد خادم وليست مشكلة في بحثك.";
          }
          throw new Error(data.error || "تعذر التحليل الآن.");
        }
        results(data.result, data.meta);
      } catch (errorValue) {
        error.textContent = errorValue.name === "AbortError" ? "أُلغي التحليل. يمكنك المحاولة مجددًا." : errorValue.message;
        error.classList.add("is-error");
        go.disabled = false;
        cancel.hidden = true;
      }
    });
    cancel.addEventListener("click", () => controller?.abort());
  }

  function list(items) { return (items || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>غير موضح</li>"; }

  function results(result, meta = {}) {
    const dimensions = (result.technicalReadiness?.dimensions || []).map((dimension) => `<li><b>${esc(dimension.id)}</b><span>${esc(dimension.explanation)}</span></li>`).join("");
    const truncationNotice = meta.truncated ? `<p class="rafid-notice" role="status">تم تحليل الجزء المقبول من المستند الطويل فقط؛ أعد التحليل على ملخص مركز أو الأقسام المتبقية للحصول على تغطية أوسع.</p>` : "";
    root().innerHTML = `
      <header class="rafid-header"><a class="rafid-logo" href="#"><span>ر</span><b>رافد</b></a><button id="new" class="rafid-text-button" type="button">تحليل جديد</button></header>
      <section class="rafid-report"><span class="rafid-kicker">نتيجة التحليل</span><h1>جاهزية البحث</h1><p class="report-summary">${esc(result.researchSummary || "غير موضح")}</p>${truncationNotice}
        <div class="scores"><article><span>الجاهزية التقنية</span><meter min="0" max="100" value="${Number(result.technicalReadiness?.score || 0)}"></meter><b>${Number(result.technicalReadiness?.score || 0)}<small>/100</small></b></article><article><span>الجاهزية التمويلية</span><meter min="0" max="100" value="${Number(result.fundingReadiness?.score || 0)}"></meter><b>${Number(result.fundingReadiness?.score || 0)}<small>/100</small></b></article></div>
        <p class="confidence">مستوى الثقة: <b>${esc(result.confidence || "منخفض")}</b></p>
        <details open><summary>تفسير الدرجات</summary><ul class="dimension-list">${dimensions}</ul></details>
        <details><summary>النواقص والتحسينات</summary><ul>${list(result.criticalGaps)}</ul></details>
        <details><summary>خطة العمل</summary><ul>${list(result.actionPlan)}</ul></details>
        <p class="rafid-notice">${esc(result.fundingDisclaimer || "هذا التحليل إرشادي ولا يضمن قبول البحث أو الحصول على تمويل.")}</p>
        <div class="form-actions"><button id="copy" class="rafid-secondary" type="button">نسخ الملخص</button><button id="print" class="rafid-primary" type="button">طباعة التقرير</button></div>
      </section>`;
    root().querySelector("#new").addEventListener("click", submitView);
    root().querySelector("#copy").addEventListener("click", () => navigator.clipboard?.writeText(result.researchSummary || ""));
    root().querySelector("#print").addEventListener("click", () => window.print());
  }

  window.addEventListener("DOMContentLoaded", async () => { await loadRuntime(); app(); });
})();
