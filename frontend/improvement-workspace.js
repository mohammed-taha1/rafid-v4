"use strict";

(() => {
  const t = (ar, en) => window.RafidI18n?.t(ar, en) ?? ar;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  const stateKey = "rafid-improvement-workspace-v1";
  const historyKey = "rafid-readiness-history-v1";
  let controller;

  function score(assessment) { return assessment?.readiness?.score_available ? Number(assessment.readiness.opportunity_readiness_score) : null; }
  function evidenceScore(assessment) { return Number(assessment?.readiness?.evidence_strength_score || 0); }

  function load(key, storage = sessionStorage) { try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; } }
  function save(key, value, storage = sessionStorage) { storage.setItem(key, JSON.stringify(value)); }

  function makeTasks(assessment) { return window.RafidImprovementModel.makeTasks(assessment, window.RafidI18n?.language || "ar"); }

  function recordRound(assessment) {
    const history = load(historyKey, localStorage) || [];
    history.push(window.RafidImprovementModel.buildRound(assessment));
    save(historyKey, history.slice(-20), localStorage);
  }

  function persistState(state) { save(stateKey, state); }

  function workspaceHeader() {
    return `<header class="rafid-header"><a class="rafid-logo" href="#home" aria-label="${t("رافد، الصفحة الرئيسية", "Rafid, home")}"><span class="brand-logo-crop"><img src="assets/rafid-logo.png" alt="" width="1254" height="1254" /></span><b class="sr-only">Rafid</b></a><button id="backToResult" class="rafid-text-button" type="button">${t("العودة للنتيجة", "Back to result")}</button></header>`;
  }

  function open(input) {
    const existing = load(stateKey);
    const state = input?.assessment ? { opportunity: input.opportunity, assessment: input.assessment, tasks: makeTasks(input.assessment), templates: { impact: "", budget: "", risks: "", implementation: "" } } : existing;
    if (!state?.assessment || !state?.opportunity) return;
    persistState(state);
    if (!existing || input?.assessment) recordRound(state.assessment);
    const history = load(historyKey, localStorage) || [];
    const latestChange = history.length > 1 ? window.RafidImprovementModel.compareRounds(history.at(-2), history.at(-1)) : null;
    const root = document.querySelector(".rafid");
    root.innerHTML = `${workspaceHeader()}<section class="improvement-workspace"><div class="improvement-hero"><div><span class="rafid-kicker">${t("حسّن بحثك", "Improve your research")}</span><h1 tabindex="-1">${t("حوّل الفجوات إلى أدلة ومهام", "Turn gaps into evidence and tasks")}</h1><p>${t("مساحة عمل على هذا الجهاز تساعدك على الاستكمال دون كتابة حقائق أو طلب تمويل نيابة عنك.", "A device-local workspace that supports improvement without inventing facts or writing the funding application for you.")}</p></div><div class="improvement-score"><span>${t("الدرجة الحالية", "Current score")}</span><b>${score(state.assessment) ?? "—"}</b><small>${t("قوة الأدلة", "Evidence strength")}: ${evidenceScore(state.assessment)}/100</small></div></div>
      <section class="improvement-section"><div class="section-heading"><span class="rafid-kicker">${t("قائمة العمل", "Action list")}</span><h2>${t("أغلق كل فجوة بدليل", "Close each gap with evidence")}</h2></div><div class="improvement-tasks">${state.tasks.map((task) => `<article class="improvement-task ${task.completed ? "is-complete" : ""}"><label><input type="checkbox" data-task="${esc(task.id)}" ${task.completed ? "checked" : ""}/><span>${esc(task.priority)}</span><b>${esc(task.title)}</b></label><p>${esc(task.why || t("أكمل هذا البند لرفع موثوقية القرار.", "Complete this item to strengthen the decision."))}</p><blockquote>${esc(task.question)}</blockquote></article>`).join("") || `<p class="empty-state">${t("لا توجد مهام مستخرجة.", "No extracted tasks.")}</p>`}</div></section>
      <section class="improvement-section"><div class="section-heading"><span class="rafid-kicker">${t("قوالب الاستكمال", "Improvement templates")}</span><h2>${t("اكتب الأدلة بلغتك ثم أضفها للنسخة المحسنة", "Draft evidence, then add it to the improved version")}</h2></div><div class="template-grid"><label>${t("قالب الأثر", "Impact template")}<textarea data-template="impact" rows="5" placeholder="${t("من المستفيد؟ ما التغير المتوقع؟ كيف سيقاس؟ وما خط الأساس؟", "Who benefits? What changes? How will it be measured? What is the baseline?")}">${esc(state.templates.impact)}</textarea></label><label>${t("قالب الميزانية", "Budget template")}<textarea data-template="budget" rows="5" placeholder="${t("البند، الكمية، التكلفة، أساس التقدير، والمخرج المرتبط.", "Item, quantity, cost, estimate basis, and linked output.")}">${esc(state.templates.budget)}</textarea></label><label>${t("قالب المخاطر", "Risk template")}<textarea data-template="risks" rows="5" placeholder="${t("الخطر، الاحتمال، الأثر، الإجراء الوقائي، والمسؤول.", "Risk, likelihood, impact, mitigation, and owner.")}">${esc(state.templates.risks)}</textarea></label><label>${t("قالب خطة التنفيذ", "Implementation template")}<textarea data-template="implementation" rows="5" placeholder="${t("المرحلة، النشاط، المخرج، المدة، المسؤول، ومؤشر الإنجاز.", "Phase, activity, output, duration, owner, and success indicator.")}">${esc(state.templates.implementation)}</textarea></label></div><p class="rafid-notice">${t("تحفظ المسودات في جلسة هذا التبويب فقط، ولا تُرسل حتى تبدأ إعادة التقييم.", "Drafts stay in this tab session and are not sent until you start reassessment.")}</p></section>
      <section class="improvement-section"><div class="section-heading"><span class="rafid-kicker">${t("الجولة التالية", "Next round")}</span><h2>${t("ارفع النسخة المحسنة وأعد التقييم", "Upload the improved version and reassess")}</h2></div><div class="source-choice-grid"><label class="file-picker"><input id="improvedFile" type="file" accept=".pdf,.docx,.txt,.md"/><b>${t("رفع النسخة المحسنة", "Upload improved version")}</b><small>PDF · DOCX · TXT · MD</small></label><label class="paste-source"><b>${t("أو الصق النص المحسن", "Or paste improved text")}</b><textarea id="improvedText" rows="9"></textarea></label></div><div class="form-actions"><button id="reassessImproved" class="rafid-primary" type="button">${t("أعد التقييم وقارن قبل/بعد", "Reassess and compare before/after")}</button><button id="cancelImproved" class="rafid-secondary" type="button" hidden>${t("إلغاء", "Cancel")}</button></div><p id="improvementProgress" role="status"></p></section>
      <section class="improvement-section"><div class="section-heading"><span class="rafid-kicker">${t("سجل التطور", "Readiness history")}</span><h2>${t("قبل وبعد", "Before and after")}</h2>${latestChange ? `<p>${t("تغير الجاهزية", "Readiness change")}: ${latestChange.score_change === null ? "—" : `${latestChange.score_change >= 0 ? "+" : ""}${latestChange.score_change}`} · ${t("تغير الأدلة", "Evidence change")}: ${latestChange.evidence_change >= 0 ? "+" : ""}${latestChange.evidence_change} · ${t("فجوات حرجة مغلقة", "Closed critical gaps")}: ${latestChange.closed_critical_gaps}</p>` : ""}</div><div class="history-grid">${history.map((round, index) => `<article><span>${t("الجولة", "Round")} ${index + 1}</span><b>${round.score ?? "—"}</b><small>${esc(round.eligibility)} · ${t("الأدلة", "Evidence")} ${round.evidence_score}/100</small></article>`).join("")}</div><p class="rafid-notice">${t("يحفظ السجل درجات وحالات مجمعة فقط على هذا الجهاز؛ لا يحفظ نص البحث.", "History stores aggregate scores and statuses on this device only; it does not store research text.")}</p></section></section>`;
    root.querySelector("#backToResult").addEventListener("click", () => window.RafidApp?.showMatchResult({ opportunity: state.opportunity, assessment: state.assessment, meta: {} }));
    root.querySelectorAll("[data-task]").forEach((inputNode) => inputNode.addEventListener("change", () => { const task = state.tasks.find((item) => item.id === inputNode.dataset.task); if (task) task.completed = inputNode.checked; persistState(state); inputNode.closest("article")?.classList.toggle("is-complete", inputNode.checked); }));
    root.querySelectorAll("[data-template]").forEach((node) => node.addEventListener("input", () => { state.templates[node.dataset.template] = node.value; persistState(state); }));
    root.querySelector("#reassessImproved").addEventListener("click", () => reassess(state));
    root.querySelector("#cancelImproved").addEventListener("click", () => controller?.abort());
    window.scrollTo({ top: 0, behavior: "instant" }); root.querySelector("h1")?.focus();
  }

  async function reassess(state) {
    const root = document.querySelector(".rafid"); const progress = root.querySelector("#improvementProgress"); const button = root.querySelector("#reassessImproved"); const cancel = root.querySelector("#cancelImproved");
    try {
      const typed = root.querySelector("#improvedText").value.trim(); const file = root.querySelector("#improvedFile").files[0];
      if (typed && file) throw new Error(t("اختر النص أو الملف، وليس الاثنين.", "Choose text or file, not both."));
      let text = typed; let files = [];
      if (file) { const documentData = await window.RafidIngest.read(file, { maxFileSizeMb: 20 }); text = documentData.fullText; files = [{ name: documentData.safeDisplayName || file.name, type: file.type, size: file.size }]; }
      if (text.length < 30) throw new Error(t("أضف 30 حرفًا على الأقل من النسخة المحسنة.", "Add at least 30 characters from the improved version."));
      button.disabled = true; cancel.hidden = false; controller = new AbortController(); progress.textContent = t("إنشاء جولة جديدة…", "Creating a new round…");
      const privacy = { classification: "internal", remote_processing_confirmed: true, redaction_preview_confirmed: true, redactions_applied: [] };
      const response = await fetch("/api/rafid/analysis/jobs", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ opportunity: state.opportunity, project_request: { raw_text: text, metadata: { title: state.assessment?.project_summary?.title || t("نسخة محسنة", "Improved version"), type: "بحث أو مشروع ابتكاري" }, files, privacy }, previous_assessment: state.assessment, output_language: window.RafidI18n?.language || "ar", service_key: "improve_research" }), signal: controller.signal });
      const created = await response.json(); if (!response.ok) throw new Error(created.error || t("تعذر بدء الجولة.", "Could not start the round."));
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const poll = await fetch(`/api/rafid/analysis/jobs/${encodeURIComponent(created.job.job_id)}`, { headers: { Accept: "application/json", "x-rafid-job-token": created.resume_token }, signal: controller.signal });
        const payload = await poll.json(); if (!poll.ok) throw new Error(payload.error || t("تعذر متابعة الجولة.", "Could not follow the round."));
        progress.textContent = `${payload.job.progress}% · ${esc(payload.job.stage)}`;
        if (payload.job.status === "completed") { recordRound(payload.job.result.assessment); sessionStorage.removeItem(stateKey); window.RafidApp?.showMatchResult({ opportunity: payload.job.result.opportunity, assessment: payload.job.result.assessment, meta: { job: payload.job.timings_ms, chunks: payload.job.chunk_metrics, flow_id: payload.job.job_id, service_key: "improve_research" } }); return; }
        if (["failed","timed_out","cancelled"].includes(payload.job.status)) throw new Error(payload.job.error?.message || t("لم تكتمل الجولة.", "The round did not complete."));
      }
    } catch (error) { progress.textContent = error.name === "AbortError" ? t("أُلغي التقييم وبقيت مساحة العمل.", "Reassessment was cancelled; the workspace remains.") : error.message; progress.classList.add("is-error"); button.disabled = false; cancel.hidden = true; }
  }

  window.RafidImprove = Object.freeze({ open });
})();
