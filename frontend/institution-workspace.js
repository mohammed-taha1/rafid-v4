"use strict";

(() => {
  const t = (ar, en) => window.RafidI18n?.t(ar, en) ?? ar;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const sessionKey = "rafid-institution-session";
  let config;
  let session;
  let selectedOrganization;

  function safeSession() {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || "null"); } catch { return null; }
  }

  function saveSession(value) {
    session = value;
    if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
    else sessionStorage.removeItem(sessionKey);
  }

  async function runtime() {
    if (config) return config;
    const response = await fetch("/api/rafid/public/config", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(t("تعذر تحميل إعداد مساحة المؤسسة.", "Could not load institution workspace configuration."));
    config = await response.json();
    return config;
  }

  async function supabase(path, { method = "GET", body, token = session?.access_token, prefer } = {}) {
    const cfg = await runtime();
    if (!cfg.auth?.enabled) throw new Error(t("مساحة المؤسسات غير مهيأة بعد.", "Institution workspaces are not configured yet."));
    const headers = { apikey: cfg.auth.publishable_key, Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const response = await fetch(`${cfg.auth.supabase_url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) saveSession(null);
      throw new Error(payload?.message || payload?.msg || t("لم تكتمل العملية. تحقق من الصلاحية والمدخلات.", "The operation could not be completed. Check permissions and inputs."));
    }
    return payload;
  }

  const rest = (table, query = "", options = {}) => supabase(`/rest/v1/${table}${query}`, options);
  const rpc = (name, body = {}) => supabase(`/rest/v1/rpc/${name}`, { method: "POST", body });

  function logo() {
    return `<a class="rafid-logo" href="#home" aria-label="${t("رافد، الصفحة الرئيسية", "Rafid, home")}"><span class="brand-logo-frame"><img src="assets/rafid-logo.png" alt="${t("شعار رافد", "Rafid logo")}" width="1254" height="1254" /></span></a>`;
  }

  function siteHeader() {
    return `<header class="rafid-header institutional-header">${logo()}<nav aria-label="${t("التنقل الرئيسي", "Main navigation")}"><a href="#home">${t("الرئيسية", "Home")}</a><a href="#services">${t("الخدمات", "Services")}</a><a href="#learn">${t("مركز التعلم", "Learning")}</a><a href="#privacy">${t("الخصوصية", "Privacy")}</a><a href="#contact">${t("تواصل معنا", "Contact")}</a></nav>${window.RafidI18n?.controls() || ""}</header>`;
  }

  function siteFooter() {
    return `<footer class="site-footer"><div><b>${t("رافد", "Rafid")}</b><p>${t("من البحث إلى قرار تمويلي أوضح، مع الخصوصية والدليل أولًا.", "From research to a clearer funding decision, with privacy and evidence first.")}</p></div><nav><a href="#how">${t("طريقة الاستخدام", "How to use")}</a><a href="#faq">${t("الأسئلة الشائعة", "FAQ")}</a><a href="#about">${t("عن رافد", "About")}</a><a href="#privacy">${t("الخصوصية", "Privacy")}</a><a href="#terms">${t("الشروط", "Terms")}</a><a href="#contact">${t("تواصل معنا", "Contact")}</a></nav></footer>`;
  }

  function shell(content) {
    const root = document.querySelector(".rafid");
    root.className = "rafid institution-portal";
    root.innerHTML = `${siteHeader()}<main class="institution-main">${content}</main>${siteFooter()}`;
    window.scrollTo({ top: 0, behavior: "instant" });
    return root;
  }

  function authView(message = "") {
    const root = shell(`<section class="institution-auth"><div><span class="rafid-kicker">${t("رافد للمؤسسات البحثية", "Rafid for research institutions")}</span><h1 tabindex="-1">${t("حوّل محفظة الأبحاث إلى قائمة قرارات", "Turn a research portfolio into an action list")}</h1><p>${t("مساحات عمل معزولة، أدوار واضحة، ترتيب للمشاريع، وفجوات مشتركة قابلة للتنفيذ.", "Isolated workspaces, explicit roles, project prioritization, and actionable shared gaps.")}</p><ul><li>${t("عزل كامل بين المؤسسات عبر RLS", "Strict tenant isolation through RLS")}</li><li>${t("لا يُخزن نص البحث الخام", "Raw research text is not stored")}</li><li>${t("سجل تدقيق للإجراءات الحساسة", "Audit log for sensitive actions")}</li></ul></div><form id="institutionAuth" class="institution-card"><h2>${t("دخول مساحة المؤسسة", "Institution sign in")}</h2><label>${t("البريد الإلكتروني", "Email")}<input id="institutionEmail" type="email" autocomplete="email" required /></label><label>${t("كلمة المرور", "Password")}<input id="institutionPassword" type="password" autocomplete="current-password" minlength="8" required /></label><div class="form-actions"><button class="rafid-primary" value="signin" type="submit">${t("تسجيل الدخول", "Sign in")}</button><button class="rafid-secondary" value="signup" type="submit">${t("إنشاء حساب", "Create account")}</button></div><p class="rafid-notice">${t("يُطلب الدخول فقط لمساحات المؤسسات لحماية بياناتها. التحليل الفردي العام يبقى متاحًا دون تسجيل.", "Sign-in is only required for protected institution workspaces. Public individual analysis remains available without sign-in.")}</p><p id="institutionMessage" class="rafid-error" role="alert">${esc(message)}</p></form></section>`);
    root.querySelector("h1")?.focus();
    root.querySelector("#institutionAuth").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      const email = root.querySelector("#institutionEmail").value.trim();
      const password = root.querySelector("#institutionPassword").value;
      const target = root.querySelector("#institutionMessage");
      button.disabled = true;
      try {
        const cfg = await runtime();
        const path = button.value === "signup" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
        const result = await supabase(path, { method: "POST", body: { email, password }, token: null });
        if (!result.access_token) {
          target.textContent = t("تم إنشاء الحساب. افتح رسالة التحقق ثم سجل الدخول.", "Account created. Verify your email, then sign in.");
          return;
        }
        saveSession({ access_token: result.access_token, refresh_token: result.refresh_token, user: result.user, expires_at: Date.now() + Number(result.expires_in || 3600) * 1000, project: new URL(cfg.auth.supabase_url).host });
        await rpc("rafid_accept_my_institution_invites").catch(() => 0);
        await workspaceView();
      } catch (error) { target.textContent = error.message; target.classList.add("is-error"); }
      finally { button.disabled = false; }
    });
  }

  async function listOrganizations() {
    return rest("rafid_organizations", "?select=id,name,slug,created_at&order=created_at.desc");
  }

  function organizationPicker(organizations) {
    return `<section class="institution-welcome"><div><span class="rafid-kicker">${t("مساحات العمل", "Workspaces")}</span><h1 tabindex="-1">${t("اختر المؤسسة التي ستعمل عليها", "Choose an institution workspace")}</h1><p>${t("لن ترى إلا المؤسسات التي تملك عضوية نشطة فيها.", "You can only see institutions where you have an active membership.")}</p></div><button id="institutionSignout" class="rafid-text-button" type="button">${t("تسجيل الخروج", "Sign out")}</button></section><div class="organization-grid">${organizations.map((organization) => `<button class="organization-card" type="button" data-organization="${esc(organization.id)}"><b>${esc(organization.name)}</b><small>${esc(organization.slug)}</small><span>${t("فتح لوحة المؤسسة", "Open dashboard")} ←</span></button>`).join("")}<form id="createOrganization" class="organization-card create-card"><b>${t("إنشاء مساحة عمل", "Create workspace")}</b><label>${t("اسم المؤسسة", "Institution name")}<input name="name" minlength="2" maxlength="160" required /></label><label>${t("المعرّف المختصر", "Short identifier")}<input name="slug" pattern="[a-z0-9-]{2,80}" placeholder="research-center" required /></label><button class="rafid-primary" type="submit">${t("إنشاء آمن", "Create securely")}</button><p role="alert"></p></form></div>`;
  }

  async function workspaceView() {
    if (!session?.access_token) return authView();
    try {
      const organizations = await listOrganizations();
      if (selectedOrganization && organizations.some((item) => item.id === selectedOrganization.id)) return dashboardView(selectedOrganization);
      const root = shell(organizationPicker(organizations));
      root.querySelector("h1")?.focus();
      root.querySelector("#institutionSignout").addEventListener("click", () => { saveSession(null); selectedOrganization = null; authView(); });
      root.querySelectorAll("[data-organization]").forEach((button) => button.addEventListener("click", () => {
        selectedOrganization = organizations.find((item) => item.id === button.dataset.organization);
        dashboardView(selectedOrganization);
      }));
      root.querySelector("#createOrganization").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const target = form.querySelector("p");
        try {
          const [created] = await rest("rafid_organizations", "?select=id,name,slug,created_at", { method: "POST", prefer: "return=representation", body: { name: form.name.value.trim(), slug: form.slug.value.trim().toLowerCase(), created_by: session.user.id } });
          selectedOrganization = created;
          await dashboardView(created);
        } catch (error) { target.textContent = error.message; }
      });
    } catch (error) { authView(error.message); }
  }

  function metric(title, value, hint = "") {
    return `<article class="institution-metric"><span>${esc(title)}</span><b>${esc(value)}</b>${hint ? `<small>${esc(hint)}</small>` : ""}</article>`;
  }

  function rows(items, empty, render) {
    return items?.length ? items.map(render).join("") : `<p class="empty-state">${esc(empty)}</p>`;
  }

  async function loadOrganizationData(org) {
    const encoded = encodeURIComponent(`eq.${org.id}`);
    const [dashboard, departments, projects, opportunities, members, audits] = await Promise.all([
      rpc("rafid_institution_dashboard", { target_org: org.id }),
      rest("rafid_departments", `?organization_id=${encoded}&select=id,name,kind&order=name`),
      rest("rafid_institution_projects", `?organization_id=${encoded}&select=id,title,field,readiness_stage,technical_score,funding_score,evidence_score,preparation_horizon,current_round,status,department_id&order=funding_score.desc`),
      rest("rafid_institution_opportunities", `?organization_id=${encoded}&select=id,title,funder,deadline,status&order=deadline.asc`),
      rest("rafid_organization_members", `?organization_id=${encoded}&select=user_id,role,is_active,department_id,created_at`),
      rest("rafid_audit_log", `?organization_id=${encoded}&select=id,action,entity_type,created_at&order=created_at.desc&limit=20`).catch(() => []),
    ]);
    return { dashboard, departments, projects, opportunities, members, audits };
  }

  function dashboardMarkup(org, data) {
    const d = data.dashboard || {};
    const average = data.projects.length ? Math.round(data.projects.reduce((sum, item) => sum + item.funding_score, 0) / data.projects.length) : 0;
    return `<section class="institution-top"><div><button id="changeOrganization" class="rafid-text-button" type="button">← ${t("كل المساحات", "All workspaces")}</button><span class="rafid-kicker">${t("لوحة المؤسسة", "Institution dashboard")}</span><h1 tabindex="-1">${esc(org.name)}</h1><p>${t("صورة تنفيذية للمحفظة، دون حفظ نصوص الأبحاث الخام.", "An executive portfolio view without storing raw research content.")}</p></div><div class="institution-actions"><button id="exportInstitution" class="rafid-secondary" type="button">${t("تصدير تقرير الإدارة", "Export management report")}</button><button id="institutionSignout" class="rafid-text-button" type="button">${t("تسجيل الخروج", "Sign out")}</button></div></section>
      <section class="institution-metrics" aria-label="${t("مؤشرات المؤسسة", "Institution metrics")}">${metric(t("إجمالي المشاريع", "Total projects"), d.project_count || 0)}${metric(t("متوسط الجاهزية التمويلية", "Average funding readiness"), `${average}/100`)}${metric(t("مشاريع سريعة التجهيز", "Quick-preparation projects"), d.quick_projects?.length || 0)}${metric(t("تحتاج دعمًا طويلًا", "Long-support projects"), d.long_support_projects?.length || 0)}${metric(t("الأقسام والمراكز", "Departments and centers"), data.departments.length)}${metric(t("أعضاء الفريق", "Team members"), data.members.length)}</section>
      <nav class="institution-tabs" aria-label="${t("أقسام اللوحة", "Dashboard sections")}"><a href="#institution-overview">${t("النظرة التنفيذية", "Overview")}</a><a href="#institution-projects">${t("المشاريع", "Projects")}</a><a href="#institution-opportunities">${t("الفرص", "Opportunities")}</a><a href="#institution-team">${t("الفريق والصلاحيات", "Team and roles")}</a><a href="#institution-audit">${t("سجل التدقيق", "Audit log")}</a></nav>
      <section id="institution-overview" class="institution-grid"><article class="institution-card"><h2>${t("أقرب المشاريع للتمويل", "Projects closest to funding")}</h2>${rows(d.top_projects, t("لا توجد مشاريع بعد.", "No projects yet."), (item) => `<div class="rank-row"><b>${esc(item.title)}</b><span>${item.funding_score}/100</span><small>${t("دليل", "Evidence")}: ${item.evidence_score}/100</small></div>`)}</article><article class="institution-card"><h2>${t("الشروط المانعة الأكثر تكرارًا", "Most common blockers")}</h2>${rows(d.common_blockers, t("تظهر بعد إضافة جولات تقييم.", "Available after adding review rounds."), (item) => `<div class="rank-row"><b>${esc(item.blocker)}</b><span>${item.total}</span></div>`)}</article><article class="institution-card"><h2>${t("احتياجات التدريب", "Training needs")}</h2>${rows(d.training_needs, t("لا توجد احتياجات مسجلة.", "No training needs recorded."), (item) => `<div class="rank-row"><b>${esc(item.need)}</b><span>${item.total}</span></div>`)}</article><article class="institution-card"><h2>${t("التقدم بين جولات التقييم", "Progress across review rounds")}</h2>${rows(d.round_progress, t("أضف مراجعات متعددة لرؤية التقدم.", "Add multiple review rounds to see progress."), (item) => `<div class="rank-row"><b>${t("الجولة", "Round")} ${item.round_number}</b><span>${item.readiness}/100</span><small>${item.reviews} ${t("مراجعة", "reviews")}</small></div>`)}</article></section>
      <section id="institution-projects" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("المحفظة", "Portfolio")}</span><h2>${t("المشاريع وقائمة الأولويات", "Projects and priority list")}</h2></div><form id="addProject" class="institution-inline-form"><label>${t("اسم المشروع", "Project title")}<input name="title" minlength="2" maxlength="240" required /></label><label>${t("المجال", "Field")}<input name="field" maxlength="180" /></label><label>${t("القسم", "Department")}<select name="department_id"><option value="">${t("دون قسم", "No department")}</option>${data.departments.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select></label><label>${t("مرحلة الجاهزية", "Readiness stage")}<select name="readiness_stage"><option value="unknown">${t("غير محدد", "Unknown")}</option><option value="idea">${t("فكرة", "Idea")}</option><option value="concept">${t("مفهوم", "Concept")}</option><option value="prototype">${t("نموذج أولي", "Prototype")}</option><option value="lab_test">${t("اختبار مخبري", "Lab test")}</option><option value="field_test">${t("اختبار ميداني", "Field test")}</option><option value="mvp">MVP</option><option value="scale_ready">${t("جاهز للتوسع", "Scale ready")}</option></select></label><button class="rafid-primary" type="submit">${t("إضافة مشروع", "Add project")}</button><p role="alert"></p></form><div class="institution-table-wrap"><table><thead><tr><th>${t("المشروع", "Project")}</th><th>${t("المجال", "Field")}</th><th>${t("تقني", "Technical")}</th><th>${t("تمويلي", "Funding")}</th><th>${t("الدليل", "Evidence")}</th><th>${t("الأفق", "Horizon")}</th></tr></thead><tbody>${data.projects.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.field || t("غير محدد", "Unspecified"))}</td><td>${item.technical_score}</td><td><b>${item.funding_score}</b></td><td>${item.evidence_score}</td><td>${esc(item.preparation_horizon)}</td></tr>`).join("")}</tbody></table></div></section>
      <section id="institution-opportunities" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("المقارنة", "Matching")}</span><h2>${t("فرص المؤسسة", "Institution opportunities")}</h2></div><form id="addOpportunity" class="institution-inline-form"><label>${t("اسم الفرصة", "Opportunity title")}<input name="title" required maxlength="240" /></label><label>${t("الجهة الممولة", "Funder")}<input name="funder" maxlength="200" /></label><label>${t("الموعد", "Deadline")}<input name="deadline" type="date" /></label><button class="rafid-primary" type="submit">${t("إضافة فرصة", "Add opportunity")}</button><p role="alert"></p></form><div class="compact-list">${rows(data.opportunities, t("لم تُضف فرص بعد.", "No opportunities added."), (item) => `<article><b>${esc(item.title)}</b><span>${esc(item.funder || "—")}</span><small>${esc(item.deadline || t("الموعد غير محدد", "No deadline"))}</small></article>`)}</div></section>
      <section id="institution-team" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("الحوكمة", "Governance")}</span><h2>${t("الأقسام، المراكز، والمدعوون", "Departments, centers, and invitees")}</h2></div><div class="institution-grid"><form id="addDepartment" class="institution-card"><h3>${t("إضافة قسم أو مركز", "Add a department or center")}</h3><label>${t("الاسم", "Name")}<input name="name" required maxlength="160" /></label><label>${t("النوع", "Type")}<select name="kind"><option value="department">${t("قسم", "Department")}</option><option value="center">${t("مركز", "Center")}</option><option value="program">${t("برنامج", "Program")}</option></select></label><button class="rafid-primary" type="submit">${t("إضافة", "Add")}</button><p role="alert"></p></form><form id="inviteMember" class="institution-card"><h3>${t("دعوة مدير أو مراجع", "Invite a manager or reviewer")}</h3><label>${t("البريد", "Email")}<input type="email" name="email" required /></label><label>${t("الدور", "Role")}<select name="role"><option value="program_manager">${t("مدير برنامج", "Program manager")}</option><option value="reviewer">${t("مراجع", "Reviewer")}</option><option value="viewer">${t("مشاهد", "Viewer")}</option><option value="admin">${t("مدير مساحة", "Workspace admin")}</option></select></label><button class="rafid-primary" type="submit">${t("إرسال الدعوة", "Send invite")}</button><p role="alert"></p></form></div><div class="compact-list">${data.departments.map((item) => `<article><b>${esc(item.name)}</b><span>${esc(item.kind)}</span></article>`).join("")}</div></section>
      <section id="institution-audit" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("الشفافية", "Accountability")}</span><h2>${t("سجل التدقيق", "Audit log")}</h2><p>${t("متاح فقط لمالك المساحة ومديريها.", "Available only to workspace owners and administrators.")}</p></div><div class="audit-list">${rows(data.audits, t("لا توجد أحداث ظاهرة أو ليست لديك صلاحية العرض.", "No visible events, or your role cannot view them."), (item) => `<article><time>${new Date(item.created_at).toLocaleString(window.RafidI18n?.isEnglish() ? "en" : "ar-SA")}</time><b>${esc(item.action)}</b><span>${esc(item.entity_type)}</span></article>`)}</div></section>`;
  }

  async function dashboardView(org) {
    const root = shell(`<section class="institution-loading"><h1>${esc(org.name)}</h1><p>${t("جارٍ تحميل لوحة المؤسسة…", "Loading institution dashboard…")}</p></section>`);
    try {
      const data = await loadOrganizationData(org);
      root.querySelector(".institution-main").innerHTML = dashboardMarkup(org, data);
      bindDashboard(root, org, data);
      root.querySelector("h1")?.focus();
    } catch (error) { root.querySelector(".institution-main").innerHTML = `<section class="institution-loading"><h1>${esc(org.name)}</h1><p class="rafid-error is-error">${esc(error.message)}</p><button id="changeOrganization" class="rafid-secondary" type="button">${t("العودة لمساحات العمل", "Back to workspaces")}</button></section>`; root.querySelector("#changeOrganization").addEventListener("click", () => { selectedOrganization = null; workspaceView(); }); }
  }

  function downloadCsv(org, data) {
    const lines = [["project", "field", "stage", "technical_score", "funding_score", "evidence_score", "preparation_horizon"], ...data.projects.map((item) => [item.title, item.field || "", item.readiness_stage, item.technical_score, item.funding_score, item.evidence_score, item.preparation_horizon])];
    const csv = lines.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `rafid-${org.slug}-portfolio.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bindDashboard(root, org, data) {
    root.querySelector("#changeOrganization").addEventListener("click", () => { selectedOrganization = null; workspaceView(); });
    root.querySelector("#institutionSignout").addEventListener("click", () => { saveSession(null); selectedOrganization = null; authView(); });
    root.querySelector("#exportInstitution").addEventListener("click", () => downloadCsv(org, data));
    const bind = (id, table, makeBody) => root.querySelector(id).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button[type=submit]");
      const target = form.querySelector("p[role=alert]");
      button.disabled = true;
      try {
        await rest(table, "", { method: "POST", body: makeBody(form), prefer: "return=minimal" });
        await dashboardView(org);
      } catch (error) { target.textContent = error.message; target.classList.add("is-error"); button.disabled = false; }
    });
    bind("#addProject", "rafid_institution_projects", (form) => ({ organization_id: org.id, department_id: form.department_id.value || null, title: form.title.value.trim(), field: form.field.value.trim() || null, readiness_stage: form.readiness_stage.value, raw_content_stored: false, created_by: session.user.id }));
    bind("#addOpportunity", "rafid_institution_opportunities", (form) => ({ organization_id: org.id, title: form.title.value.trim(), funder: form.funder.value.trim() || null, deadline: form.deadline.value || null, created_by: session.user.id }));
    bind("#addDepartment", "rafid_departments", (form) => ({ organization_id: org.id, name: form.name.value.trim(), kind: form.kind.value, created_by: session.user.id }));
    bind("#inviteMember", "rafid_organization_invites", (form) => ({ organization_id: org.id, email: form.email.value.trim().toLowerCase(), role: form.role.value, created_by: session.user.id }));
  }

  function enhanceLanding() {
    const grid = document.querySelector(".service-grid");
    if (grid && !grid.querySelector("#startInstitution")) {
      const button = document.createElement("button");
      button.id = "startInstitution";
      button.className = "service-card institution-service";
      button.type = "button";
      button.innerHTML = `<span class="service-number">05</span><span class="service-status">${t("لدي مؤسسة ومحفظة مشاريع", "I manage an institution portfolio")}</span><strong>${t("رافد للمؤسسات البحثية", "Rafid for research institutions")}</strong><small>${t("أنشئ مساحة معزولة، أضف الأقسام والمشاريع، رتّب الأولويات، واكشف الفجوات واحتياجات التدريب.", "Create an isolated workspace, manage departments and projects, rank priorities, and identify shared gaps and training needs.")}</small><i>${t("فتح لوحة المؤسسة", "Open institution dashboard")} <b aria-hidden="true">←</b></i>`;
      button.addEventListener("click", () => { location.hash = "institution"; institutionView(); });
      grid.append(button);
    }
    document.querySelectorAll(".rafid-header").forEach((header) => {
      if (!header.querySelector(".language-switch")) header.insertAdjacentHTML("beforeend", window.RafidI18n?.controls() || "");
    });
  }

  function institutionView() {
    session = safeSession();
    if (!session?.access_token || session.expires_at <= Date.now()) return authView();
    workspaceView();
  }

  const observer = new MutationObserver(enhanceLanding);
  window.addEventListener("DOMContentLoaded", () => {
    enhanceLanding();
    observer.observe(document.querySelector("#rafidApp"), { childList: true, subtree: true });
    if (location.hash === "#institution") institutionView();
  });
  window.addEventListener("hashchange", () => {
    if (location.hash === "#institution") institutionView();
    else if ((location.hash === "#home" || !location.hash) && document.querySelector(".institution-portal")) window.RafidApp?.home();
  });
  window.RafidInstitution = Object.freeze({ open: institutionView });
})();
