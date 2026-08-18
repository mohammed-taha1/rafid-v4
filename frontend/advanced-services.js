"use strict";

(() => {
  let activeController;
  let runtimeLimits;
  const t = (ar, en) => window.RafidI18n?.t(ar, en) ?? ar;
  const applicationStatus = (value) => ({
    open: t("مفتوحة", "Open"),
    closed: t("مغلقة", "Closed"),
    upcoming: t("قادمة", "Upcoming"),
    verify_official_source: t("تحقق من المصدر الرسمي", "Verify the official source"),
  })[value] || value;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const root = () => document.querySelector(".rafid");
  const privacy = () => ({ classification: "internal", remote_processing_confirmed: true, redaction_preview_confirmed: true, redactions_applied: [] });
  const header = (title) => `<header class="rafid-header"><a class="rafid-logo" href="#home" aria-label="${t("رافد، الصفحة الرئيسية", "Rafid, home")}"><span class="brand-logo-crop"><img src="assets/rafid-logo.png" alt="" width="1254" height="1254" /></span><b class="sr-only">Rafid</b></a><button id="advancedBack" class="rafid-text-button" type="button">${t("العودة للخدمات", "Back to services")}</button></header><div class="advanced-title"><span class="rafid-kicker">${esc(title)}</span></div>`;

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
      const error = new Error(payload.error || t("تعذر إكمال الطلب. بقيت مدخلاتك لتعيد المحاولة.", "The request could not be completed. Your inputs remain available to retry."));
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
    if (typed && files.length) throw new Error(t(`اختر لصق نص ${label} أو رفع ملف، وليس الاثنين.`, `Choose either pasted ${label} text or one uploaded file, not both.`));
    if (!typed && files.length !== 1) throw new Error(t(`أدخل نص ${label} أو ارفع ملفًا واحدًا.`, `Enter ${label} text or upload one file.`));
    if (typed) return { text: typed, name: t("نص مدخل", "Pasted text") };
    return fileText(files[0]);
  }

  async function extractProject(source, title, signal) {
      const response = await callApi("extract", {
        output_language: window.RafidI18n?.language || "ar",
      raw_text: source.text,
      metadata: { title: title || source.name, type: "بحث أو مشروع" },
      files: [{ name: source.name }],
      privacy: privacy(),
    }, signal);
    return response.project_data;
  }

  async function extractOpportunity(source, metadata, signal) {
      const response = await callApi("opportunity/extract", {
        output_language: window.RafidI18n?.language || "ar",
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
    main.innerHTML = `${header(t("اكتشاف فرص التمويل", "Funding opportunity discovery"))}
      <section class="advanced-shell"><div class="advanced-hero"><div><h1 tabindex="-1">${t("اعثر على المسارات الأقرب لبحثك", "Find the funding paths closest to your research")}</h1><p>${t("يحلل رافد مشروعك مرة واحدة، ثم يقارنه حتميًا بكتالوج موثق المصدر. الترتيب تمهيدي ولا يدّعي أن التقديم مفتوح.", "Rafid analyzes your project once, then applies deterministic comparisons against a source-verified catalog. Rankings are preliminary and do not imply that applications are open.")}</p></div><aside><b>${t("النتيجة التي ستحصل عليها", "What you will receive")}</b><span>${t("ترتيب واضح", "A clear ranking")}</span><span>${t("سبب الترشيح", "Why it was suggested")}</span><span>${t("ما ينقص لحسم الأهلية", "What is missing to confirm eligibility")}</span></aside></div>
      <div class="advanced-form"><label><b>${t("عنوان البحث أو المشروع", "Research or project title")}</b><input id="discoveryTitle" type="text" maxlength="180" placeholder="${t("مثال: نظام ذكي لكشف تسرب المياه", "Example: An intelligent water-leak detection system")}" /></label><div class="advanced-source-grid"><label><b>${t("الصق ملخص البحث", "Paste the research summary")}</b><textarea id="discoveryText" rows="12" placeholder="${t("المشكلة، الحل، المرحلة الحالية، النتائج، الفريق، الأثر والميزانية…", "Problem, solution, current stage, results, team, impact, and budget…")}"></textarea></label><label class="advanced-file"><b>${t("أو ارفع ملف البحث", "Or upload the research file")}</b><input id="discoveryFile" type="file" accept=".pdf,.docx,.txt,.md" /><span>PDF · DOCX · TXT · MD</span><small>${t("ملف واحد، ولا نخزنه افتراضيًا.", "One file, not stored by default.")}</small></label></div><p class="rafid-notice">${t("يتحقق رافد من الملاءمة المبدئية فقط. حالة الدعوة والأهلية النهائية تُراجع في المصدر الرسمي.", "Rafid checks preliminary fit only. Verify the call status and final eligibility in the official source.")}</p><p id="advancedError" class="rafid-error" role="alert"></p><div class="form-actions"><button id="runDiscovery" class="rafid-primary" type="button">${t("حلّل البحث واقترح الفرص", "Analyze research and suggest opportunities")}</button><button id="advancedCancel" class="rafid-secondary" type="button" hidden>${t("إلغاء", "Cancel")}</button></div><p id="advancedProgress" class="advanced-progress" role="status"></p></div></section>`;
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
        const source = await sourceFrom(main.querySelector("#discoveryText"), main.querySelector("#discoveryFile"), t("البحث", "research"));
        if (source.text.length < 30) throw new Error(t("أدخل 30 حرفًا على الأقل من البحث.", "Enter at least 30 characters of research content."));
        progress.textContent = t("١/٢ استخراج عناصر البحث والأدلة…", "1/2 Extracting research elements and evidence…");
        const project = await extractProject(source, main.querySelector("#discoveryTitle").value.trim(), activeController.signal);
        progress.textContent = t("٢/٢ مقارنة المشروع بالفرص وترتيبها…", "2/2 Comparing and ranking opportunities…");
        const response = await callApi("opportunities/discover", { project_data: project, filters: { limit: 8 }, output_language: window.RafidI18n?.language || "ar", privacy: privacy() }, activeController.signal);
        renderDiscovery(response.result);
      } catch (value) {
        error.textContent = value.name === "AbortError" ? t("أُلغي الطلب، ويمكنك البدء مجددًا.", "The request was canceled. You can start again.") : value.message;
        button.disabled = false;
        cancel.hidden = true;
        progress.textContent = "";
      }
    });
    resetView();
  }

  function renderDiscovery(result) {
    const matches = Array.isArray(result?.matches) ? result.matches : [];
    root().innerHTML = `${header(t("نتيجة اكتشاف الفرص", "Opportunity discovery result"))}
      <section class="advanced-report"><div class="advanced-report-head"><div><span class="rafid-kicker">${esc(result.catalog_version)}</span><h1 tabindex="-1">${t("أفضل المسارات لبحثك", "Best funding paths for your research")}</h1><p>${esc(result.project_summary?.title)} · ${t(`تمت مقارنة ${esc(result.considered_items)} برامج`, `${esc(result.considered_items)} programs compared`)}</p></div><button id="newDiscovery" class="rafid-primary" type="button">${t("تحليل بحث آخر", "Analyze another research project")}</button></div>
      <p class="source-freshness">${t("آخر تحقق من الكتالوج:", "Catalog last verified:")} ${esc(result.catalog_verified_at)} · ${t("لا تعني الإضافة أن باب التقديم مفتوح.", "Inclusion does not mean applications are open.")}</p>
      <div class="discovery-list">${matches.map((match) => `<article class="discovery-card"><div class="discovery-rank"><span>#${match.rank}</span><div class="score-ring compact ${scoreTone(match.match_score)}" style="--score:${match.match_score}" role="img" aria-label="${t(`درجة الملاءمة التمهيدية ${match.match_score} من 100`, `Preliminary fit score ${match.match_score} out of 100`)}"><b>${match.match_score}<small>/100</small></b></div></div><div class="discovery-main"><div><span>${esc(match.opportunity.funder)}</span><h2>${esc(match.opportunity.title)}</h2><p>${esc(match.opportunity.summary)}</p></div><div class="discovery-badges"><span>${t("الأهلية:", "Eligibility:")} ${esc(match.preliminary_eligibility)}</span><span>${t("الثقة:", "Confidence:")} ${esc(match.confidence_score)}/100</span><span>${esc(applicationStatus(match.opportunity.application_status))}</span></div><details><summary>${t("لماذا رُشحت؟", "Why was it suggested?")}</summary>${match.why_recommended.length ? `<ul>${match.why_recommended.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : `<p>${t("التشابه محدود ويحتاج مراجعة بشرية.", "The match is limited and requires human review.")}</p>`}</details><details><summary>${t("ما الذي يجب التحقق منه؟", "What must be verified?")}</summary><ul>${match.missing_for_decision.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></details><div class="discovery-actions"><a class="rafid-primary" href="${esc(match.opportunity.official_url)}" target="_blank" rel="noopener noreferrer">${t("افتح المصدر الرسمي", "Open official source")}</a><small>${esc(match.hard_gate_warning)}</small></div></div></article>`).join("") || `<p class="empty-value">${t("لا توجد فرص مطابقة للفلاتر الحالية.", "No opportunities match the current filters.")}</p>`}</div>
      <p class="rafid-notice">${esc(result.disclaimer)}</p></section>`;
    root().querySelector("#advancedBack").addEventListener("click", () => window.RafidApp.home());
    root().querySelector("#newDiscovery").addEventListener("click", discoveryView);
    resetView();
  }

  function splitPastedProjects(value) {
    return String(value || "").split(/\n\s*---\s*(?:مشروع|project)\s*---\s*\n/i).map((text) => text.trim()).filter(Boolean);
  }

  function portfolioView() {
    const main = root();
    main.innerHTML = `${header(t("المحفظة المؤسسية", "Institutional portfolio"))}
      <section class="advanced-shell"><div class="advanced-hero"><div><h1 tabindex="-1">${t("أي المشاريع أقرب لهذه الفرصة؟", "Which projects are the best fit for this opportunity?")}</h1><p>${t("أضف فرصة واحدة و2–5 مشاريع. يرتب رافد الأهلية أولًا، ثم الجاهزية والأدلة، ولا يصدر رفضًا آليًا.", "Add one opportunity and 2–5 projects. Rafid ranks eligibility first, then readiness and evidence, without issuing automated rejection decisions.")}</p></div><aside><b>${t("مناسب لـ", "Designed for")}</b><span>${t("عمادات البحث", "Research offices")}</span><span>${t("مكاتب الابتكار", "Innovation offices")}</span><span>${t("مراجعة دفعة قبل الموعد", "Batch review before a deadline")}</span></aside></div>
      <div class="advanced-form portfolio-form"><div class="portfolio-opportunity"><label><b>${t("اسم الفرصة", "Opportunity name")}</b><input id="portfolioOppTitle" type="text" maxlength="180" /></label><label><b>${t("الجهة الممولة", "Funder")}</b><input id="portfolioFunder" type="text" maxlength="180" /></label><label><b>${t("الرابط الرسمي", "Official URL")}</b><input id="portfolioUrl" type="url" placeholder="https://" /></label><label><b>${t("نص الفرصة", "Opportunity text")}</b><textarea id="portfolioOppText" rows="8" placeholder="${t("الصق الشروط الرسمية هنا…", "Paste the official criteria here…")}"></textarea></label><label class="advanced-file compact-file"><b>${t("أو ملف الفرصة", "Or upload the opportunity file")}</b><input id="portfolioOppFile" type="file" accept=".pdf,.docx,.txt,.md" /></label></div><div class="portfolio-projects"><label class="advanced-file"><b>${t("ارفع ملفات المشاريع", "Upload project files")}</b><input id="portfolioProjects" type="file" accept=".pdf,.docx,.txt,.md" multiple /><span>${t("من ملفين إلى 5 ملفات؛ كل ملف مشروع مستقل.", "Upload 2 to 5 files; each file is a separate project.")}</span></label><div class="choice-divider"><span>${t("أو", "or")}</span></div><label><b>${t("الصق عدة مشاريع", "Paste multiple projects")}</b><textarea id="portfolioPasted" rows="12" placeholder="${t("المشروع الأول…&#10;&#10;--- مشروع ---&#10;&#10;المشروع الثاني…", "First project…&#10;&#10;--- Project ---&#10;&#10;Second project…")}"></textarea><small>${t("افصل بين كل مشروع والذي يليه بالسطر: --- مشروع ---", "Separate projects with the line: --- Project ---")}</small></label></div><p class="rafid-notice">${t("لا تُخزن الملفات أو النصوص افتراضيًا. المقارنة أداة دعم قرار وتبقى المراجعة البشرية إلزامية.", "Files and text are not stored by default. This comparison supports decisions; human review remains required.")}</p><p id="advancedError" class="rafid-error" role="alert"></p><div class="form-actions"><button id="runPortfolio" class="rafid-primary" type="button">${t("حلّل المحفظة ورتّب المشاريع", "Analyze and rank the portfolio")}</button><button id="advancedCancel" class="rafid-secondary" type="button" hidden>${t("إلغاء", "Cancel")}</button></div><p id="advancedProgress" class="advanced-progress" role="status"></p></div></section>`;
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
        if (url && new URL(url).protocol !== "https:") throw new Error(t("الرابط الرسمي يجب أن يستخدم HTTPS.", "The official URL must use HTTPS."));
        const opportunitySource = await sourceFrom(main.querySelector("#portfolioOppText"), main.querySelector("#portfolioOppFile"), t("الفرصة", "opportunity"));
        if (opportunitySource.text.length < 100) throw new Error(t("أدخل 100 حرف على الأقل من شروط الفرصة.", "Enter at least 100 characters of opportunity criteria."));
        const projectFiles = Array.from(main.querySelector("#portfolioProjects").files || []);
        const pasted = splitPastedProjects(main.querySelector("#portfolioPasted").value);
        if (projectFiles.length && pasted.length) throw new Error(t("اختر ملفات المشاريع أو النصوص المفصولة، وليس الاثنين.", "Choose either project files or separated pasted projects, not both."));
        if (projectFiles.length > 5 || pasted.length > 5) throw new Error(t("الحد الحالي للواجهة 5 مشاريع في المقارنة الواحدة.", "The current limit is 5 projects per comparison."));
        if (projectFiles.length < 2 && pasted.length < 2) throw new Error(t("أضف مشروعين على الأقل للمقارنة.", "Add at least two projects to compare."));
        progress.textContent = t("١/٣ استخراج شروط الفرصة…", "1/3 Extracting opportunity criteria…");
        const opportunity = await extractOpportunity(opportunitySource, { title: main.querySelector("#portfolioOppTitle").value.trim(), funder: main.querySelector("#portfolioFunder").value.trim(), url }, activeController.signal);
        const sources = projectFiles.length ? await Promise.all(projectFiles.map(fileText)) : pasted.map((text, index) => ({ text, name: t(`المشروع ${index + 1}`, `Project ${index + 1}`) }));
        const projects = [];
        for (let index = 0; index < sources.length; index += 1) {
          progress.textContent = t(`٢/٣ استخراج المشروع ${index + 1} من ${sources.length}…`, `2/3 Extracting project ${index + 1} of ${sources.length}…`);
          projects.push(await extractProject(sources[index], sources[index].name, activeController.signal));
        }
        progress.textContent = t("٣/٣ تطبيق قواعد الأهلية وترتيب المحفظة…", "3/3 Applying eligibility rules and ranking the portfolio…");
        const response = await callApi("portfolio/compare", { opportunity, projects, output_language: window.RafidI18n?.language || "ar", privacy: privacy() }, activeController.signal);
        renderPortfolio(response.result);
      } catch (value) {
        error.textContent = value.name === "AbortError" ? t("أُلغيت المقارنة، ويمكنك البدء مجددًا.", "The comparison was canceled. You can start again.") : value.message;
        button.disabled = false;
        cancel.hidden = true;
        progress.textContent = "";
      }
    });
    resetView();
  }

  function portfolioCsv(result) {
    const rows = [[t("الترتيب", "Rank"), t("المشروع", "Project"), t("الأهلية", "Eligibility"), t("الجاهزية", "Readiness"), t("الأدلة", "Evidence"), t("الثقة", "Confidence"), t("الأولوية", "Priority"), t("الإجراء التالي", "Next action")]];
    (result.ranking || []).forEach((row) => rows.push([row.rank, row.title, row.decision.eligibility, row.decision.readiness_score, row.decision.evidence_score, row.decision.confidence_score, row.decision.priority_band, row.decision.next_action]));
    return `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n")}`;
  }

  function renderPortfolio(result) {
    const rows = Array.isArray(result?.ranking) ? result.ranking : [];
    root().innerHTML = `${header(t("نتيجة المحفظة المؤسسية", "Institutional portfolio result"))}
      <section class="advanced-report"><div class="advanced-report-head"><div><span class="rafid-kicker">${esc(result.portfolio_version)}</span><h1 tabindex="-1">${t("ترتيب المشاريع لفرصة", "Project ranking for")} ${esc(result.opportunity?.title)}</h1><p>${esc(result.summary?.decision_rule)}</p></div><div class="report-actions"><button id="downloadPortfolio" class="rafid-secondary" type="button">${t("تنزيل CSV", "Download CSV")}</button><button id="newPortfolio" class="rafid-primary" type="button">${t("مقارنة جديدة", "New comparison")}</button></div></div>
      <div class="portfolio-summary"><article><span>${t("المشاريع", "Projects")}</span><b>${esc(result.summary?.total_projects)}</b></article><article><span>${t("تحتاج مراجعة بشرية", "Require human review")}</span><b>${esc(result.summary?.projects_requiring_human_review)}</b></article><article><span>${t("الحفظ الافتراضي", "Default storage")}</span><b>${t("لا يوجد", "None")}</b></article></div>
      <div class="portfolio-ranking">${rows.map((row) => `<article class="portfolio-row"><div class="portfolio-position"><span>${row.rank}</span><small>${t("الترتيب", "Rank")}</small></div><div class="portfolio-project"><span class="eligibility-badge ${row.decision.eligibility === "غير مؤهل" ? "failed" : "unknown"}">${esc(row.decision.eligibility)}</span><h2>${esc(row.title)}</h2><p>${esc(row.decision.priority_band)}</p></div><div class="portfolio-metrics"><span><b>${row.decision.readiness_score === null ? t("غير كافٍ", "Insufficient") : row.decision.readiness_score}</b> ${t("الجاهزية", "Readiness")}</span><span><b>${row.decision.evidence_score}</b> ${t("الأدلة", "Evidence")}</span><span><b>${row.decision.confidence_score}</b> ${t("الثقة", "Confidence")}</span></div><details><summary>${t("قرار المراجع والإجراء التالي", "Reviewer decision and next action")}</summary><p><b>${t("الإجراء:", "Action:")}</b> ${esc(row.decision.next_action)}</p><p><b>${t("بوابات فاشلة:", "Failed gates:")}</b> ${row.decision.failed_gates} · <b>${t("غير محسومة:", "Unresolved:")}</b> ${row.decision.unknown_gates} · <b>${t("فجوات حرجة:", "Critical gaps:")}</b> ${row.decision.critical_gaps}</p>${row.decision.top_blockers.length ? `<ul>${row.decision.top_blockers.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}</details></article>`).join("")}</div><p class="rafid-notice">${esc(result.disclaimer)}</p></section>`;
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
