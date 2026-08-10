"use strict";

(() => {
  let activeController;
  let runtimeLimits;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const root = () => document.querySelector(".rafid");
  const privacy = () => ({ classification: "internal", remote_processing_confirmed: true, redaction_preview_confirmed: true, redactions_applied: [] });
  const header = (title) => `<header class="rafid-header"><a class="rafid-logo" href="#home" aria-label="رافد، الصفحة الرئيسية"><span class="brand-logo-crop"><img src="assets/rafid-logo.png" alt="" width="1254" height="1254" /></span><b class="sr-only">رافد</b></a><button id="advancedBack" class="rafid-text-button" type="button">العودة للخدمات</button></header><div class="advanced-title"><span class="rafid-kicker">${esc(title)}</span></div>`;

  function resetView() {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    requestAnimationFrame(() => root()?.querySelector("h1")?.focus({ preventScroll: true }));
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
      const error = new Error(payload.error || "تعذر إكمال الطلب. بقيت مدخلاتك لتعيد المحاولة.");
      error.code = payload.code;
      throw error;
    }
    return payload;
  }

  async function maxFileSizeMb() {
    if (runtimeLimits) return runtimeLimits.max_file_size_mb || 20;
    try {
      const response = await fetch("/api/rafid/public/config", { headers: { Accept: "application/json" } });
      const payload = response.ok ? await response.json() : {};
      runtimeLimits = payload.limits || {};
    } catch {
      runtimeLimits = {};
    }
    return runtimeLimits.max_file_size_mb || 20;
  }

  async function fileText(file) {
    const documentData = await window.RafidIngest.read(file, { maxFileSizeMb: await maxFileSizeMb() });
    return { text: documentData.fullText, name: documentData.safeDisplayName || file.name };
  }

  async function sourceFrom(textarea, input, label) {
    const typed = textarea.value.trim();
    const files = Array.from(input.files || []);
    if (typed && files.length) throw new Error(`اختر لصق نص ${label} أو رفع ملف، وليس الاثنين.`);
    if (!typed && files.length !== 1) throw new Error(`أدخل نص ${label} أو ارفع ملفًا واحدًا.`);
    if (typed) return { text: typed, name: "نص مدخل" };
    return fileText(files[0]);
  }

  async function extractProject(source, title, signal) {
    const response = await callApi("extract", {
      raw_text: source.text,
      metadata: { title: title || source.name, type: "بحث أو مشروع" },
      files: [{ name: source.name }],
      privacy: privacy(),
    }, signal);
    return response.project_data;
  }

  async function extractOpportunity(source, metadata, signal) {
    const response = await callApi("opportunity/extract", {
      source_text: source.text,
      metadata: { title: metadata.title, funder: metadata.funder, official_source_url: metadata.url, source_name: source.name },
      privacy: privacy(),
    }, signal);
    return response.opportunity;
  }

  function scoreTone(score) {
    if (score >= 70) return "high";
    if (score >= 45) return "medium";
    return "low";
  }

  function discoveryView() {
    const main = root();
    main.innerHTML = `${header("اكتشاف فرص التمويل")}
      <section class="advanced-shell"><div class="advanced-hero"><div><h1 tabindex="-1">اعثر على المسارات الأقرب لبحثك</h1><p>يحلل رافد مشروعك مرة واحدة، ثم يقارنه حتميًا بكتالوج موثق المصدر. الترتيب تمهيدي ولا يدّعي أن التقديم مفتوح.</p></div><aside><b>النتيجة التي ستحصل عليها</b><span>ترتيب واضح</span><span>سبب الترشيح</span><span>ما ينقص لحسم الأهلية</span></aside></div>
      <div class="advanced-form"><label><b>عنوان البحث أو المشروع</b><input id="discoveryTitle" type="text" maxlength="180" placeholder="مثال: نظام ذكي لكشف تسرب المياه" /></label><div class="advanced-source-grid"><label><b>الصق ملخص البحث</b><textarea id="discoveryText" rows="12" placeholder="المشكلة، الحل، المرحلة الحالية، النتائج، الفريق، الأثر والميزانية…"></textarea></label><label class="advanced-file"><b>أو ارفع ملف البحث</b><input id="discoveryFile" type="file" accept=".pdf,.docx,.txt,.md" /><span>PDF · DOCX · TXT · MD</span><small>ملف واحد، ولا نخزنه افتراضيًا.</small></label></div><p class="rafid-notice">يتحقق رافد من الملاءمة المبدئية فقط. حالة الدعوة والأهلية النهائية تُراجع في المصدر الرسمي.</p><p id="advancedError" class="rafid-error" role="alert"></p><div class="form-actions"><button id="runDiscovery" class="rafid-primary" type="button">حلّل البحث واقترح الفرص</button><button id="advancedCancel" class="rafid-secondary" type="button" hidden>إلغاء</button></div><p id="advancedProgress" class="advanced-progress" role="status"></p></div></section>`;
    main.querySelector("#advancedBack").addEventListener("click", () => window.RafidApp.home());
    main.querySelector("#advancedCancel").addEventListener("click", () => activeController?.abort());
    main.querySelector("#runDiscovery").addEventListener("click", async () => {
      const button = main.querySelector("#runDiscovery");
      const cancel = main.querySelector("#advancedCancel");
      const progress = main.querySelector("#advancedProgress");
      const error = main.querySelector("#advancedError");
      try {
        button.disabled = true;
        cancel.hidden = false;
        error.textContent = "";
        activeController = new AbortController();
        const source = await sourceFrom(main.querySelector("#discoveryText"), main.querySelector("#discoveryFile"), "البحث");
        if (source.text.length < 30) throw new Error("أدخل 30 حرفًا على الأقل من البحث.");
        progress.textContent = "١/٢ استخراج عناصر البحث والأدلة…";
        const project = await extractProject(source, main.querySelector("#discoveryTitle").value.trim(), activeController.signal);
        progress.textContent = "٢/٢ مقارنة المشروع بالفرص وترتيبها…";
        const response = await callApi("opportunities/discover", { project_data: project, filters: { limit: 8 }, privacy: privacy() }, activeController.signal);
        renderDiscovery(response.result);
      } catch (value) {
        error.textContent = value.name === "AbortError" ? "أُلغي الطلب، ويمكنك البدء مجددًا." : value.message;
        button.disabled = false;
        cancel.hidden = true;
        progress.textContent = "";
      }
    });
    resetView();
  }

  function renderDiscovery(result) {
    const matches = Array.isArray(result?.matches) ? result.matches : [];
    root().innerHTML = `${header("نتيجة اكتشاف الفرص")}
      <section class="advanced-report"><div class="advanced-report-head"><div><span class="rafid-kicker">${esc(result.catalog_version)}</span><h1 tabindex="-1">أفضل المسارات لبحثك</h1><p>${esc(result.project_summary?.title)} · تمت مقارنة ${esc(result.considered_items)} برامج</p></div><button id="newDiscovery" class="rafid-primary" type="button">تحليل بحث آخر</button></div>
      <p class="source-freshness">آخر تحقق من الكتالوج: ${esc(result.catalog_verified_at)} · لا تعني الإضافة أن باب التقديم مفتوح.</p>
      <div class="discovery-list">${matches.map((match) => `<article class="discovery-card"><div class="discovery-rank"><span>#${match.rank}</span><div class="score-ring compact ${scoreTone(match.match_score)}" style="--score:${match.match_score}" role="img" aria-label="درجة الملاءمة التمهيدية ${match.match_score} من 100"><b>${match.match_score}<small>/100</small></b></div></div><div class="discovery-main"><div><span>${esc(match.opportunity.funder)}</span><h2>${esc(match.opportunity.title)}</h2><p>${esc(match.opportunity.summary)}</p></div><div class="discovery-badges"><span>الأهلية: ${esc(match.preliminary_eligibility)}</span><span>الثقة: ${esc(match.confidence_score)}/100</span><span>${esc(match.opportunity.application_status)}</span></div><details><summary>لماذا رُشحت؟</summary>${match.why_recommended.length ? `<ul>${match.why_recommended.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "<p>التشابه محدود ويحتاج مراجعة بشرية.</p>"}</details><details><summary>ما الذي يجب التحقق منه؟</summary><ul>${match.missing_for_decision.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></details><div class="discovery-actions"><a class="rafid-primary" href="${esc(match.opportunity.official_url)}" target="_blank" rel="noopener noreferrer">افتح المصدر الرسمي</a><small>${esc(match.hard_gate_warning)}</small></div></div></article>`).join("") || '<p class="empty-value">لا توجد فرص مطابقة للفلاتر الحالية.</p>'}</div>
      <p class="rafid-notice">${esc(result.disclaimer)}</p></section>`;
    root().querySelector("#advancedBack").addEventListener("click", () => window.RafidApp.home());
    root().querySelector("#newDiscovery").addEventListener("click", discoveryView);
    resetView();
  }

  function splitPastedProjects(value) {
    return String(value || "").split(/\n\s*---\s*مشروع\s*---\s*\n/i).map((text) => text.trim()).filter(Boolean);
  }

  function portfolioView() {
    const main = root();
    main.innerHTML = `${header("المحفظة المؤسسية")}
      <section class="advanced-shell"><div class="advanced-hero"><div><h1 tabindex="-1">أي المشاريع أقرب لهذه الفرصة؟</h1><p>أضف فرصة واحدة و2–5 مشاريع. يرتب رافد الأهلية أولًا، ثم الجاهزية والأدلة، ولا يصدر رفضًا آليًا.</p></div><aside><b>مناسب لـ</b><span>عمادات البحث</span><span>مكاتب الابتكار</span><span>مراجعة دفعة قبل الموعد</span></aside></div>
      <div class="advanced-form portfolio-form"><div class="portfolio-opportunity"><label><b>اسم الفرصة</b><input id="portfolioOppTitle" type="text" maxlength="180" /></label><label><b>الجهة الممولة</b><input id="portfolioFunder" type="text" maxlength="180" /></label><label><b>الرابط الرسمي</b><input id="portfolioUrl" type="url" placeholder="https://" /></label><label><b>نص الفرصة</b><textarea id="portfolioOppText" rows="8" placeholder="الصق الشروط الرسمية هنا…"></textarea></label><label class="advanced-file compact-file"><b>أو ملف الفرصة</b><input id="portfolioOppFile" type="file" accept=".pdf,.docx,.txt,.md" /></label></div><div class="portfolio-projects"><label class="advanced-file"><b>ارفع ملفات المشاريع</b><input id="portfolioProjects" type="file" accept=".pdf,.docx,.txt,.md" multiple /><span>من ملفين إلى 5 ملفات؛ كل ملف مشروع مستقل.</span></label><div class="choice-divider"><span>أو</span></div><label><b>الصق عدة مشاريع</b><textarea id="portfolioPasted" rows="12" placeholder="المشروع الأول…&#10;&#10;--- مشروع ---&#10;&#10;المشروع الثاني…"></textarea><small>افصل بين كل مشروع والذي يليه بالسطر: --- مشروع ---</small></label></div><p class="rafid-notice">لا تُخزن الملفات أو النصوص افتراضيًا. المقارنة أداة دعم قرار وتبقى المراجعة البشرية إلزامية.</p><p id="advancedError" class="rafid-error" role="alert"></p><div class="form-actions"><button id="runPortfolio" class="rafid-primary" type="button">حلّل المحفظة ورتّب المشاريع</button><button id="advancedCancel" class="rafid-secondary" type="button" hidden>إلغاء</button></div><p id="advancedProgress" class="advanced-progress" role="status"></p></div></section>`;
    main.querySelector("#advancedBack").addEventListener("click", () => window.RafidApp.home());
    main.querySelector("#advancedCancel").addEventListener("click", () => activeController?.abort());
    main.querySelector("#runPortfolio").addEventListener("click", async () => {
      const button = main.querySelector("#runPortfolio");
      const cancel = main.querySelector("#advancedCancel");
      const progress = main.querySelector("#advancedProgress");
      const error = main.querySelector("#advancedError");
      try {
        button.disabled = true;
        cancel.hidden = false;
        error.textContent = "";
        activeController = new AbortController();
        const url = main.querySelector("#portfolioUrl").value.trim();
        if (url && new URL(url).protocol !== "https:") throw new Error("الرابط الرسمي يجب أن يستخدم HTTPS.");
        const opportunitySource = await sourceFrom(main.querySelector("#portfolioOppText"), main.querySelector("#portfolioOppFile"), "الفرصة");
        if (opportunitySource.text.length < 100) throw new Error("أدخل 100 حرف على الأقل من شروط الفرصة.");
        const projectFiles = Array.from(main.querySelector("#portfolioProjects").files || []);
        const pasted = splitPastedProjects(main.querySelector("#portfolioPasted").value);
        if (projectFiles.length && pasted.length) throw new Error("اختر ملفات المشاريع أو النصوص المفصولة، وليس الاثنين.");
        if (projectFiles.length > 5 || pasted.length > 5) throw new Error("الحد الحالي للواجهة 5 مشاريع في المقارنة الواحدة.");
        if (projectFiles.length < 2 && pasted.length < 2) throw new Error("أضف مشروعين على الأقل للمقارنة.");
        progress.textContent = "١/٣ استخراج شروط الفرصة…";
        const opportunity = await extractOpportunity(opportunitySource, { title: main.querySelector("#portfolioOppTitle").value.trim(), funder: main.querySelector("#portfolioFunder").value.trim(), url }, activeController.signal);
        const sources = projectFiles.length ? await Promise.all(projectFiles.map(fileText)) : pasted.map((text, index) => ({ text, name: `المشروع ${index + 1}` }));
        const projects = [];
        for (let index = 0; index < sources.length; index += 1) {
          progress.textContent = `٢/٣ استخراج المشروع ${index + 1} من ${sources.length}…`;
          projects.push(await extractProject(sources[index], sources[index].name, activeController.signal));
        }
        progress.textContent = "٣/٣ تطبيق قواعد الأهلية وترتيب المحفظة…";
        const response = await callApi("portfolio/compare", { opportunity, projects, privacy: privacy() }, activeController.signal);
        renderPortfolio(response.result);
      } catch (value) {
        error.textContent = value.name === "AbortError" ? "أُلغيت المقارنة، ويمكنك البدء مجددًا." : value.message;
        button.disabled = false;
        cancel.hidden = true;
        progress.textContent = "";
      }
    });
    resetView();
  }

  function portfolioCsv(result) {
    const rows = [["الترتيب", "المشروع", "الأهلية", "الجاهزية", "الأدلة", "الثقة", "الأولوية", "الإجراء التالي"]];
    (result.ranking || []).forEach((row) => rows.push([row.rank, row.title, row.decision.eligibility, row.decision.readiness_score, row.decision.evidence_score, row.decision.confidence_score, row.decision.priority_band, row.decision.next_action]));
    return `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n")}`;
  }

  function renderPortfolio(result) {
    const rows = Array.isArray(result?.ranking) ? result.ranking : [];
    root().innerHTML = `${header("نتيجة المحفظة المؤسسية")}
      <section class="advanced-report"><div class="advanced-report-head"><div><span class="rafid-kicker">${esc(result.portfolio_version)}</span><h1 tabindex="-1">ترتيب المشاريع لفرصة ${esc(result.opportunity?.title)}</h1><p>${esc(result.summary?.decision_rule)}</p></div><div class="report-actions"><button id="downloadPortfolio" class="rafid-secondary" type="button">تنزيل CSV</button><button id="newPortfolio" class="rafid-primary" type="button">مقارنة جديدة</button></div></div>
      <div class="portfolio-summary"><article><span>المشاريع</span><b>${esc(result.summary?.total_projects)}</b></article><article><span>تحتاج مراجعة بشرية</span><b>${esc(result.summary?.projects_requiring_human_review)}</b></article><article><span>الحفظ الافتراضي</span><b>لا يوجد</b></article></div>
      <div class="portfolio-ranking">${rows.map((row) => `<article class="portfolio-row"><div class="portfolio-position"><span>${row.rank}</span><small>الترتيب</small></div><div class="portfolio-project"><span class="eligibility-badge ${row.decision.eligibility === "غير مؤهل" ? "failed" : "unknown"}">${esc(row.decision.eligibility)}</span><h2>${esc(row.title)}</h2><p>${esc(row.decision.priority_band)}</p></div><div class="portfolio-metrics"><span><b>${row.decision.readiness_score}</b> الجاهزية</span><span><b>${row.decision.evidence_score}</b> الأدلة</span><span><b>${row.decision.confidence_score}</b> الثقة</span></div><details><summary>قرار المراجع والإجراء التالي</summary><p><b>الإجراء:</b> ${esc(row.decision.next_action)}</p><p><b>بوابات فاشلة:</b> ${row.decision.failed_gates} · <b>غير محسومة:</b> ${row.decision.unknown_gates} · <b>فجوات حرجة:</b> ${row.decision.critical_gaps}</p>${row.decision.top_blockers.length ? `<ul>${row.decision.top_blockers.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}</details></article>`).join("")}</div><p class="rafid-notice">${esc(result.disclaimer)}</p></section>`;
    root().querySelector("#advancedBack").addEventListener("click", () => window.RafidApp.home());
    root().querySelector("#newPortfolio").addEventListener("click", portfolioView);
    root().querySelector("#downloadPortfolio").addEventListener("click", () => {
      const blob = new Blob([portfolioCsv(result)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rafid-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
    resetView();
  }

  window.RafidAdvancedServices = Object.freeze({ discovery: discoveryView, portfolio: portfolioView });
})();
