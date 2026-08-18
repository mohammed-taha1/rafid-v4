"use strict";

(() => {
  const t = (ar, en) => window.RafidI18n?.t(ar, en) ?? ar;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  let context;

  async function request(path, { method = "GET", body, prefer } = {}) {
    const { config, session } = context;
    const headers = { apikey: config.auth.publishable_key, Authorization: `Bearer ${session.access_token}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const response = await fetch(`${config.auth.supabase_url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || t("تعذر إكمال العملية.", "The operation could not be completed."));
    return payload;
  }

  const rpc = (name, body = {}) => request(`/rest/v1/rpc/${name}`, { method: "POST", body });
  const rest = (table, query = "", options = {}) => request(`/rest/v1/${table}${query}`, options);
  const pct = (value) => `${Number(value || 0).toLocaleString()}%`;
  const count = (value) => Number(value || 0).toLocaleString(window.RafidI18n?.isEnglish() ? "en" : "ar-SA");
  const milliseconds = (value) => Number(value || 0) >= 1000 ? `${(Number(value) / 1000).toFixed(1)} ${t("ث", "s")}` : `${count(value)} ${t("م.ث", "ms")}`;
  const serviceLabel = (key) => ({ general_readiness: t("تحليل الجاهزية", "Readiness analysis"), opportunity_match: t("المقارنة بفرصة", "Opportunity match"), funding_discovery: t("اكتشاف الفرص", "Funding discovery"), portfolio_compare: t("مقارنة المحفظة", "Portfolio comparison"), institution_workspace: t("مساحة المؤسسات", "Institution workspace"), improve_research: t("حسّن بحثك", "Improve research") })[key] || key;
  const gapLabel = (key) => ({ budget: t("الميزانية", "Budget"), impact: t("الأثر", "Impact"), methodology: t("المنهجية", "Methodology"), evidence: t("الأدلة", "Evidence"), team: t("الفريق", "Team"), risk: t("المخاطر", "Risk"), timeline: t("الجدول الزمني", "Timeline"), eligibility: t("الأهلية", "Eligibility"), intellectual_property: t("الملكية الفكرية", "Intellectual property"), partnerships: t("الشراكات", "Partnerships"), market: t("السوق", "Market"), measurement: t("القياس", "Measurement"), other: t("أخرى", "Other") })[key] || key;

  function card(label, value, note = "") {
    return `<article class="operations-kpi"><span>${esc(label)}</span><b>${esc(value)}</b>${note ? `<small>${esc(note)}</small>` : ""}</article>`;
  }

  function bars(items, key, value, formatter = count) {
    const maximum = Math.max(1, ...items.map((item) => Number(item[value] || 0)));
    return items.length ? items.map((item) => `<div class="operations-bar"><span>${esc(item[key])}</span><i><b style="width:${Math.max(2, Number(item[value] || 0) / maximum * 100)}%"></b></i><strong>${esc(formatter(item[value]))}</strong></div>`).join("") : `<p class="empty-state">${t("لا توجد بيانات في هذه المدة.", "No data in this period.")}</p>`;
  }

  async function load(days) {
    const [metrics, admins, invites] = await Promise.all([
      rpc("rafid_product_operations_dashboard", { target_days: days }),
      rest("rafid_platform_admins", "?select=user_id,role,is_active,created_at&order=created_at.asc"),
      rest("rafid_platform_admin_invites", "?select=id,email,role,expires_at,accepted_at,accepted_by,revoked_at,created_at&order=created_at.desc"),
    ]);
    return { metrics, admins, invites };
  }

  async function render(days = 30) {
    const root = document.querySelector(".rafid");
    root.className = "rafid institution-portal operations-portal";
    root.innerHTML = `<main class="institution-main"><section class="institution-loading"><h1>${t("لوحة تشغيل رافد", "Rafid operations dashboard")}</h1><p>${t("نجمع المقاييس المسموح بها…", "Loading permitted metrics…")}</p></section></main>`;
    try {
      const { metrics: m, admins, invites } = await load(days);
      const analysis = m.analysis || {};
      const role = context.status.role;
      const canManage = ["owner", "admin"].includes(role);
      const maxDaily = Math.max(1, ...(m.daily || []).map((item) => Number(item.succeeded || 0) + Number(item.unsuccessful || 0)));
      root.innerHTML = `<header class="rafid-header institutional-header"><a class="rafid-logo" href="#home"><span class="brand-logo-frame"><img src="assets/rafid-logo.png" alt="${t("شعار رافد", "Rafid logo")}" /></span></a><nav><button id="backToWorkspaces" class="rafid-text-button" type="button">${t("مساحات المؤسسات", "Institution workspaces")}</button><a href="#operations-team">${t("الزملاء", "Colleagues")}</a></nav>${window.RafidI18n?.controls() || ""}</header><main class="institution-main">
        <section class="operations-hero"><div><span class="rafid-kicker">${t("تشغيل وقياس المنتج", "Product operations")}</span><h1 tabindex="-1">${t("لوحة تشغيل رافد", "Rafid operations dashboard")}</h1><p>${t("مقاييس مجمعة بلا نصوص أبحاث أو أسماء ملفات أو بيانات مستخدمين.", "Aggregated metrics without research text, file names, or user data.")}</p></div><label>${t("الفترة", "Period")}<select id="operationsDays"><option value="7" ${days === 7 ? "selected" : ""}>7</option><option value="30" ${days === 30 ? "selected" : ""}>30</option><option value="90" ${days === 90 ? "selected" : ""}>90</option><option value="365" ${days === 365 ? "selected" : ""}>365</option></select></label></section>
        <section class="operations-kpis">${card(t("تحليلات ناجحة", "Successful analyses"), count(analysis.succeeded))}${card(t("تحليلات فاشلة", "Failed analyses"), count(analysis.failed))}${card(t("انتهاء مهلة", "Timed out"), count(analysis.timed_out))}${card(t("نسبة الإلغاء", "Cancellation rate"), pct(m.cancellation_rate))}${card(t("الوصول إلى التقرير", "Report reach"), pct(m.report_reach_rate), t("من التحليلات الناجحة", "of successful analyses"))}${card(t("تنزيل التقرير", "Report download"), pct(m.report_download_rate), t("من مشاهدي التقرير", "of report viewers"))}${card(t("فائدة النتيجة", "Result usefulness"), m.ratings?.average ? `${m.ratings.average}/3` : "—", `${count(m.ratings?.total)} ${t("تقييم", "ratings")}`)}</section>
        <section class="operations-grid"><article class="institution-card"><h2>${t("زمن مراحل التحليل", "Analysis stage latency")}</h2>${bars((m.stage_timings || []).map((item) => ({ ...item, label: `${item.stage} · P95 ${milliseconds(item.p95_ms)}` })), "label", "average_ms", milliseconds)}</article><article class="institution-card"><h2>${t("الخدمات الأكثر استخدامًا", "Most-used services")}</h2>${bars((m.services || []).map((item) => ({ ...item, label: serviceLabel(item.service_key) })), "label", "uses")}</article><article class="institution-card"><h2>${t("الأخطاء الأكثر تكرارًا", "Most frequent errors")}</h2>${bars(m.errors || [], "error_code", "total")}</article><article class="institution-card"><h2>${t("الفجوات الشائعة", "Common gaps")}</h2><p>${t("تصنيفات مجمعة فقط، وليست نصوصًا من الأبحاث.", "Aggregated categories only, never research text.")}</p>${bars((m.gaps || []).map((item) => ({ ...item, label: gapLabel(item.gap_key) })), "label", "total")}</article></section>
        <section class="institution-card operations-trend"><h2>${t("الاتجاه اليومي", "Daily trend")}</h2><div class="daily-bars">${(m.daily || []).length ? m.daily.map((item) => { const good = Number(item.succeeded || 0); const bad = Number(item.unsuccessful || 0); return `<div title="${esc(item.day)}"><i style="height:${Math.max(3, (good + bad) / maxDaily * 100)}%"><b style="height:${good / Math.max(1, good + bad) * 100}%"></b></i><small>${esc(String(item.day).slice(5))}</small></div>`; }).join("") : `<p class="empty-state">${t("لا توجد بيانات بعد.", "No data yet.")}</p>`}</div><p class="operations-freshness">${t("آخر حدث:", "Latest event:")} ${m.freshness ? new Date(m.freshness).toLocaleString() : t("لا يوجد بعد", "None yet")}</p></section>
        <section id="operations-team" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("إدارة المنصة", "Platform administration")}</span><h2>${t("الزملاء والصلاحيات", "Colleagues and permissions")}</h2><p>${t("المحلل يقرأ اللوحة، والمدير يدعو زملاء، والمالك يدير الأدوار.", "Analysts read the dashboard, admins invite colleagues, and the owner manages roles.")}</p></div>${canManage ? `<form id="invitePlatformAdmin" class="institution-inline-form operations-invite"><label>${t("بريد الزميل", "Colleague email")}<input name="email" type="email" required autocomplete="email" /></label><label>${t("الصلاحية", "Permission")}<select name="role"><option value="analyst">${t("محلل", "Analyst")}</option><option value="admin">${t("مدير", "Admin")}</option></select></label><button class="rafid-primary" type="submit">${t("إرسال دعوة", "Send invitation")}</button><p role="alert"></p></form>` : ""}<div class="institution-table-wrap"><table><thead><tr><th>${t("المعرّف الآمن", "Safe identifier")}</th><th>${t("الدور", "Role")}</th><th>${t("الحالة", "Status")}</th></tr></thead><tbody>${admins.map((item) => `<tr><td>${esc(item.user_id.slice(0, 8))}…</td><td>${role === "owner" && item.role !== "owner" ? `<select class="platform-role-select" data-user="${esc(item.user_id)}"><option value="analyst" ${item.role === "analyst" ? "selected" : ""}>analyst</option><option value="admin" ${item.role === "admin" ? "selected" : ""}>admin</option></select>` : esc(item.role)}</td><td>${item.is_active ? t("نشط", "Active") : t("موقوف", "Inactive")}</td></tr>`).join("")}</tbody></table></div><div class="operations-invites">${invites.map((item) => `<article><b>${esc(item.email)}</b><span>${esc(item.role)}</span><small>${item.revoked_at ? t("ملغاة", "Revoked") : item.accepted_at ? t("مقبولة", "Accepted") : t("بانتظار تسجيل الزميل وقبولها", "Pending colleague sign-in and acceptance")}</small>${canManage && !item.accepted_at && !item.revoked_at ? `<button class="rafid-text-button revoke-platform-invite" data-id="${esc(item.id)}" type="button">${t("إلغاء الدعوة", "Revoke invitation")}</button>` : ""}</article>`).join("") || `<p class="empty-state">${t("لا توجد دعوات بعد.", "No invitations yet.")}</p>`}</div></section>
        <aside class="privacy-banner"><b>${t("حدود البيانات", "Data boundary")}</b><p>${t("هذه اللوحة لا تعرض ولا تستقبل محتوى الأبحاث. لا تستخدم أرقامها كحكم علمي على الباحثين.", "This dashboard neither accepts nor displays research content. Do not use its metrics as a scientific judgment of researchers.")}</p></aside></main>`;
      root.querySelector("h1")?.focus();
      root.querySelector("#backToWorkspaces").addEventListener("click", () => context.back());
      root.querySelector("#operationsDays").addEventListener("change", (event) => render(Number(event.target.value)));
      root.querySelector("#invitePlatformAdmin")?.addEventListener("submit", async (event) => {
        event.preventDefault(); const form = event.currentTarget; const message = form.querySelector("p");
        try { await rest("rafid_platform_admin_invites", "?on_conflict=email", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { email: form.email.value.trim().toLowerCase(), role: form.role.value, created_by: context.session.user.id, expires_at: new Date(Date.now() + 14 * 86400000).toISOString(), accepted_at: null, accepted_by: null, revoked_at: null, revoked_by: null } }); await render(days); }
        catch (error) { message.textContent = error.message; }
      });
      root.querySelectorAll(".revoke-platform-invite").forEach((button) => button.addEventListener("click", async () => { await rest("rafid_platform_admin_invites", `?id=eq.${encodeURIComponent(button.dataset.id)}`, { method: "PATCH", prefer: "return=minimal", body: { revoked_at: new Date().toISOString(), revoked_by: context.session.user.id } }); await render(days); }));
      root.querySelectorAll(".platform-role-select").forEach((select) => select.addEventListener("change", async () => { await rest("rafid_platform_admins", `?user_id=eq.${encodeURIComponent(select.dataset.user)}`, { method: "PATCH", prefer: "return=minimal", body: { role: select.value, updated_at: new Date().toISOString() } }); await render(days); }));
    } catch (error) {
      root.querySelector(".institution-main").innerHTML = `<section class="institution-loading"><h1>${t("تعذر فتح لوحة التشغيل", "Could not open operations dashboard")}</h1><p class="rafid-error is-error">${esc(error.message)}</p><button id="backToWorkspaces" class="rafid-secondary" type="button">${t("العودة", "Back")}</button></section>`;
      root.querySelector("#backToWorkspaces").addEventListener("click", () => context.back());
    }
  }

  function open(options) { context = options; return render(30); }
  window.RafidOperations = Object.freeze({ open });
})();
