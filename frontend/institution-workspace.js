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

  function optionRows(items, label) {
    return items.map((item) => `<option value="${esc(item.id || item.user_id)}">${esc(label(item))}</option>`).join("");
  }

  function parseProjectCsv(source) {
    const lines = String(source || "").replace(/^\ufeff/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error(t("ملف الدفعة يحتاج رأسًا وصفًا واحدًا على الأقل.", "The batch file needs a header and at least one row."));
    const parseLine = (line) => {
      const cells = []; let value = ""; let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
        else if (char === '"') quoted = !quoted;
        else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
        else value += char;
      }
      cells.push(value.trim()); return cells;
    };
    const headers = parseLine(lines[0]).map((header) => header.toLowerCase());
    const required = headers.indexOf("title");
    if (required < 0) throw new Error(t("يجب أن يحتوي الملف على عمود title.", "The file must include a title column."));
    const allowedStages = new Set(["idea","concept","prototype","lab_test","field_test","mvp","scale_ready","unknown"]);
    return lines.slice(1, 101).map((line, rowIndex) => {
      const cells = parseLine(line); const read = (name) => cells[headers.indexOf(name)]?.trim() || "";
      const title = read("title");
      if (title.length < 2) throw new Error(t(`عنوان غير صالح في الصف ${rowIndex + 2}.`, `Invalid title on row ${rowIndex + 2}.`));
      const stage = read("readiness_stage") || "unknown";
      return { title, field: read("field") || null, readiness_stage: allowedStages.has(stage) ? stage : "unknown", department_name: read("department") || null };
    });
  }

  async function loadOrganizationData(org) {
    const encoded = encodeURIComponent(`eq.${org.id}`);
    const [dashboard, departments, projects, opportunities, members, audits, invites, assignments, reviews, comments, batches, matrix] = await Promise.all([
      rpc("rafid_institution_dashboard", { target_org: org.id }),
      rest("rafid_departments", `?organization_id=${encoded}&select=id,name,kind&order=name`),
      rest("rafid_institution_projects", `?organization_id=${encoded}&select=id,title,field,readiness_stage,technical_score,funding_score,evidence_score,preparation_horizon,current_round,status,department_id&order=funding_score.desc`),
      rest("rafid_institution_opportunities", `?organization_id=${encoded}&select=id,title,funder,deadline,status&order=deadline.asc`),
      rest("rafid_organization_members", `?organization_id=${encoded}&select=user_id,role,is_active,department_id,created_at`),
      rest("rafid_audit_log", `?organization_id=${encoded}&select=id,action,entity_type,created_at&order=created_at.desc&limit=20`).catch(() => []),
      rest("rafid_organization_invites", `?organization_id=${encoded}&select=id,email,role,expires_at,accepted_at,revoked_at&order=created_at.desc`).catch(() => []),
      rest("rafid_project_assignments", `?organization_id=${encoded}&select=project_id,user_id,assignment_role,assigned_at`).catch(() => []),
      rest("rafid_project_reviews", `?organization_id=${encoded}&select=id,project_id,opportunity_id,round_number,eligibility,readiness_score,evidence_score,confidence_score,review_status,reviewer_comment,recommendation,reviewed_by,approved_at&order=reviewed_at.desc`).catch(() => []),
      rest("rafid_review_comments", `?organization_id=${encoded}&select=id,review_id,body,comment_kind,created_by,created_at&order=created_at.asc`).catch(() => []),
      rest("rafid_project_batches", `?organization_id=${encoded}&select=id,label,source_filename,project_count,status,created_at&order=created_at.desc`).catch(() => []),
      rpc("rafid_institution_matrix", { target_org: org.id }).catch(() => ({ projects: [], opportunities: [], reviews: [] })),
    ]);
    return { dashboard, departments, projects, opportunities, members, audits, invites, assignments, reviews, comments, batches, matrix };
  }

  function pilotMarkup(org, data) {
    const projectOptions = optionRows(data.projects, (item) => item.title);
    const opportunityOptions = `<option value="">${t("تقييم عام", "General assessment")}</option>${optionRows(data.opportunities, (item) => item.title)}`;
    const memberOptions = optionRows(data.members.filter((item) => item.is_active), (item) => `${item.role} · ${item.user_id.slice(0, 8)}`);
    const reviewRows = rows(data.reviews, t("لا توجد جولات مراجعة بعد.", "No review rounds yet."), (item) => {
      const project = data.projects.find((entry) => entry.id === item.project_id)?.title || item.project_id;
      const opportunity = data.opportunities.find((entry) => entry.id === item.opportunity_id)?.title || t("تقييم عام", "General assessment");
      const comments = data.comments.filter((comment) => comment.review_id === item.id);
      return `<article class="review-round"><div><b>${esc(project)}</b><span>${esc(opportunity)} · ${t("الجولة", "Round")} ${item.round_number}</span></div><div><strong>${item.readiness_score}/100</strong><span>${esc(item.eligibility)} · ${esc(item.review_status)}</span></div><p>${esc(item.reviewer_comment || item.recommendation || t("لا يوجد تعليق.", "No comment."))}</p><div class="review-comments">${comments.map((comment) => `<blockquote><b>${esc(comment.comment_kind)}</b><span>${esc(comment.body)}</span><time>${new Date(comment.created_at).toLocaleString(window.RafidI18n?.isEnglish() ? "en" : "ar-SA")}</time></blockquote>`).join("")}</div><form class="add-review-comment" data-review="${esc(item.id)}"><label>${t("تعليق أو طلب دليل", "Comment or evidence request")}<textarea name="body" rows="2" minlength="1" maxlength="4000" required></textarea></label><select name="comment_kind"><option value="review">${t("تعليق مراجعة", "Review comment")}</option><option value="evidence_request">${t("طلب دليل", "Evidence request")}</option><option value="decision">${t("ملاحظة قرار", "Decision note")}</option></select><button class="rafid-text-button" type="submit">${t("إضافة التعليق", "Add comment")}</button><p role="alert"></p></form>${item.review_status === "submitted" ? `<button class="rafid-secondary approve-review" data-review="${esc(item.id)}" type="button">${t("اعتماد الجولة", "Approve round")}</button>` : ""}</article>`;
    });
    const matrixProjects = data.matrix?.projects || [];
    const matrixOpportunities = data.matrix?.opportunities || [];
    const matrixReviews = data.matrix?.reviews || [];
    const matrix = matrixProjects.length && matrixOpportunities.length
      ? `<div class="institution-table-wrap"><table><thead><tr><th>${t("المشروع", "Project")}</th>${matrixOpportunities.map((item) => `<th>${esc(item.title)}</th>`).join("")}</tr></thead><tbody>${matrixProjects.map((project) => `<tr><td><b>${esc(project.title)}</b></td>${matrixOpportunities.map((opportunity) => { const review = matrixReviews.find((item) => item.project_id === project.id && item.opportunity_id === opportunity.id); return `<td>${review ? `<b>${review.readiness_score}/100</b><small>${esc(review.eligibility)}</small>` : `<span>—</span>`}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<p class="empty-state">${t("أضف مشاريع وفرصًا وجولات تقييم لبناء مصفوفة المقارنة.", "Add projects, opportunities, and review rounds to build the comparison matrix.")}</p>`;
    return `<section id="institution-pilot" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("الإطلاق المؤسسي", "Institution pilot")}</span><h2>${t("الدفعات والتوزيع والمراجعات", "Batches, assignments, and reviews")}</h2></div>
      <div class="institution-grid"><form id="batchProjects" class="institution-card"><h3>${t("رفع دفعة مشاريع", "Upload project batch")}</h3><label>${t("اسم الدفعة", "Batch label")}<input name="label" required maxlength="180" /></label><label>${t("ملف CSV", "CSV file")}<input name="file" type="file" accept=".csv,text/csv" required /></label><small>title, field, readiness_stage, department</small><button class="rafid-primary" type="submit">${t("استيراد الدفعة", "Import batch")}</button><p role="alert"></p></form>
      <form id="assignProject" class="institution-card"><h3>${t("توزيع مشروع", "Assign project")}</h3><label>${t("المشروع", "Project")}<select name="project_id" required>${projectOptions}</select></label><label>${t("المراجع أو المدير", "Reviewer or manager")}<select name="user_id" required>${memberOptions}</select></label><label>${t("الدور", "Role")}<select name="assignment_role"><option value="reviewer">${t("مراجع", "Reviewer")}</option><option value="program_manager">${t("مدير برنامج", "Program manager")}</option><option value="contributor">${t("مساهم", "Contributor")}</option><option value="viewer">${t("مشاهد", "Viewer")}</option></select></label><button class="rafid-primary" type="submit">${t("تعيين", "Assign")}</button><p role="alert"></p></form>
      <form id="addReview" class="institution-card"><h3>${t("جولة تقييم", "Review round")}</h3><label>${t("المشروع", "Project")}<select name="project_id" required>${projectOptions}</select></label><label>${t("الفرصة", "Opportunity")}<select name="opportunity_id">${opportunityOptions}</select></label><label>${t("رقم الجولة", "Round")}<input name="round_number" type="number" min="1" max="100" value="1" required /></label><div class="score-inputs"><label>${t("الجاهزية", "Readiness")}<input name="readiness_score" type="number" min="0" max="100" required /></label><label>${t("الأدلة", "Evidence")}<input name="evidence_score" type="number" min="0" max="100" required /></label><label>${t("الثقة", "Confidence")}<input name="confidence_score" type="number" min="0" max="100" required /></label></div><label>${t("الأهلية", "Eligibility")}<select name="eligibility"><option value="unknown">${t("غير محسوم", "Unknown")}</option><option value="eligible">${t("مؤهل", "Eligible")}</option><option value="conditional">${t("مشروط", "Conditional")}</option><option value="ineligible">${t("غير مؤهل", "Ineligible")}</option></select></label><label>${t("تعليق المراجع", "Reviewer comment")}<textarea name="reviewer_comment" rows="3" maxlength="4000"></textarea></label><button class="rafid-primary" type="submit">${t("حفظ وإرسال للمراجعة", "Save and submit")}</button><p role="alert"></p></form></div>
      <div class="batch-summary">${rows(data.batches, t("لا توجد دفعات مستوردة.", "No imported batches."), (item) => `<article><b>${esc(item.label)}</b><span>${item.project_count} ${t("مشروع", "projects")}</span><small>${esc(item.status)}</small></article>`)}</div><div class="review-rounds">${reviewRows}</div></section>
      <section id="institution-matrix" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("عدة مشاريع × عدة فرص", "Multiple projects × opportunities")}</span><h2>${t("مصفوفة الملاءمة", "Fit matrix")}</h2></div>${matrix}</section>
      <section id="institution-governance" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("إدارة الوصول", "Access management")}</span><h2>${t("الدعوات والأدوار", "Invitations and roles")}</h2></div><div class="institution-grid"><form id="manageRole" class="institution-card"><label>${t("العضو", "Member")}<select name="user_id" required>${memberOptions}</select></label><label>${t("الدور الجديد", "New role")}<select name="role"><option value="admin">admin</option><option value="program_manager">program_manager</option><option value="reviewer">reviewer</option><option value="viewer">viewer</option></select></label><button class="rafid-secondary" type="submit">${t("تحديث الدور", "Update role")}</button><p role="alert"></p></form><div class="institution-card"><h3>${t("الدعوات", "Invitations")}</h3>${rows(data.invites, t("لا توجد دعوات ظاهرة.", "No visible invitations."), (item) => `<article class="invite-row"><b>${esc(item.email)}</b><span>${esc(item.role)}</span><small>${item.revoked_at ? t("ملغاة", "Revoked") : item.accepted_at ? t("مقبولة", "Accepted") : t("بانتظار القبول", "Pending")}</small>${!item.revoked_at && !item.accepted_at ? `<button class="rafid-text-button revoke-invite" data-invite="${esc(item.id)}" type="button">${t("إلغاء", "Revoke")}</button>` : ""}</article>`)}</div></div></section>`;
  }

  function dashboardMarkup(org, data) {
    const d = data.dashboard || {};
    const average = data.projects.length ? Math.round(data.projects.reduce((sum, item) => sum + item.funding_score, 0) / data.projects.length) : 0;
    return `<section class="institution-top"><div><button id="changeOrganization" class="rafid-text-button" type="button">← ${t("كل المساحات", "All workspaces")}</button><span class="rafid-kicker">${t("لوحة المؤسسة", "Institution dashboard")}</span><h1 tabindex="-1">${esc(org.name)}</h1><p>${t("صورة تنفيذية للمحفظة، دون حفظ نصوص الأبحاث الخام.", "An executive portfolio view without storing raw research content.")}</p></div><div class="institution-actions"><button id="exportInstitutionExcel" class="rafid-secondary" type="button">${t("تقرير Excel", "Excel report")}</button><button id="exportInstitutionPdf" class="rafid-secondary" type="button">${t("تقرير PDF", "PDF report")}</button><button id="institutionSignout" class="rafid-text-button" type="button">${t("تسجيل الخروج", "Sign out")}</button></div></section>
      <section class="institution-metrics" aria-label="${t("مؤشرات المؤسسة", "Institution metrics")}">${metric(t("إجمالي المشاريع", "Total projects"), d.project_count || 0)}${metric(t("متوسط الجاهزية التمويلية", "Average funding readiness"), `${average}/100`)}${metric(t("مشاريع سريعة التجهيز", "Quick-preparation projects"), d.quick_projects?.length || 0)}${metric(t("تحتاج دعمًا طويلًا", "Long-support projects"), d.long_support_projects?.length || 0)}${metric(t("الأقسام والمراكز", "Departments and centers"), data.departments.length)}${metric(t("أعضاء الفريق", "Team members"), data.members.length)}</section>
      <nav class="institution-tabs" aria-label="${t("أقسام اللوحة", "Dashboard sections")}"><a href="#institution-overview">${t("النظرة التنفيذية", "Overview")}</a><a href="#institution-projects">${t("المشاريع", "Projects")}</a><a href="#institution-opportunities">${t("الفرص", "Opportunities")}</a><a href="#institution-pilot">${t("الدفعات والمراجعات", "Batches and reviews")}</a><a href="#institution-matrix">${t("مصفوفة المقارنة", "Comparison matrix")}</a><a href="#institution-team">${t("الفريق", "Team")}</a><a href="#institution-governance">${t("الأدوار", "Roles")}</a><a href="#institution-audit">${t("سجل التدقيق", "Audit log")}</a></nav>
      <section id="institution-overview" class="institution-grid"><article class="institution-card"><h2>${t("أقرب المشاريع للتمويل", "Projects closest to funding")}</h2>${rows(d.top_projects, t("لا توجد مشاريع بعد.", "No projects yet."), (item) => `<div class="rank-row"><b>${esc(item.title)}</b><span>${item.funding_score}/100</span><small>${t("دليل", "Evidence")}: ${item.evidence_score}/100</small></div>`)}</article><article class="institution-card"><h2>${t("الشروط المانعة الأكثر تكرارًا", "Most common blockers")}</h2>${rows(d.common_blockers, t("تظهر بعد إضافة جولات تقييم.", "Available after adding review rounds."), (item) => `<div class="rank-row"><b>${esc(item.blocker)}</b><span>${item.total}</span></div>`)}</article><article class="institution-card"><h2>${t("احتياجات التدريب", "Training needs")}</h2>${rows(d.training_needs, t("لا توجد احتياجات مسجلة.", "No training needs recorded."), (item) => `<div class="rank-row"><b>${esc(item.need)}</b><span>${item.total}</span></div>`)}</article><article class="institution-card"><h2>${t("التقدم بين جولات التقييم", "Progress across review rounds")}</h2>${rows(d.round_progress, t("أضف مراجعات متعددة لرؤية التقدم.", "Add multiple review rounds to see progress."), (item) => `<div class="rank-row"><b>${t("الجولة", "Round")} ${item.round_number}</b><span>${item.readiness}/100</span><small>${item.reviews} ${t("مراجعة", "reviews")}</small></div>`)}</article></section>
      <section id="institution-projects" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("المحفظة", "Portfolio")}</span><h2>${t("المشاريع وقائمة الأولويات", "Projects and priority list")}</h2></div><form id="addProject" class="institution-inline-form"><label>${t("اسم المشروع", "Project title")}<input name="title" minlength="2" maxlength="240" required /></label><label>${t("المجال", "Field")}<input name="field" maxlength="180" /></label><label>${t("القسم", "Department")}<select name="department_id"><option value="">${t("دون قسم", "No department")}</option>${data.departments.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select></label><label>${t("مرحلة الجاهزية", "Readiness stage")}<select name="readiness_stage"><option value="unknown">${t("غير محدد", "Unknown")}</option><option value="idea">${t("فكرة", "Idea")}</option><option value="concept">${t("مفهوم", "Concept")}</option><option value="prototype">${t("نموذج أولي", "Prototype")}</option><option value="lab_test">${t("اختبار مخبري", "Lab test")}</option><option value="field_test">${t("اختبار ميداني", "Field test")}</option><option value="mvp">MVP</option><option value="scale_ready">${t("جاهز للتوسع", "Scale ready")}</option></select></label><button class="rafid-primary" type="submit">${t("إضافة مشروع", "Add project")}</button><p role="alert"></p></form><div class="institution-table-wrap"><table><thead><tr><th>${t("المشروع", "Project")}</th><th>${t("المجال", "Field")}</th><th>${t("تقني", "Technical")}</th><th>${t("تمويلي", "Funding")}</th><th>${t("الدليل", "Evidence")}</th><th>${t("الأفق", "Horizon")}</th></tr></thead><tbody>${data.projects.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.field || t("غير محدد", "Unspecified"))}</td><td>${item.technical_score}</td><td><b>${item.funding_score}</b></td><td>${item.evidence_score}</td><td>${esc(item.preparation_horizon)}</td></tr>`).join("")}</tbody></table></div></section>
      <section id="institution-opportunities" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("المقارنة", "Matching")}</span><h2>${t("فرص المؤسسة", "Institution opportunities")}</h2></div><form id="addOpportunity" class="institution-inline-form"><label>${t("اسم الفرصة", "Opportunity title")}<input name="title" required maxlength="240" /></label><label>${t("الجهة الممولة", "Funder")}<input name="funder" maxlength="200" /></label><label>${t("الموعد", "Deadline")}<input name="deadline" type="date" /></label><button class="rafid-primary" type="submit">${t("إضافة فرصة", "Add opportunity")}</button><p role="alert"></p></form><div class="compact-list">${rows(data.opportunities, t("لم تُضف فرص بعد.", "No opportunities added."), (item) => `<article><b>${esc(item.title)}</b><span>${esc(item.funder || "—")}</span><small>${esc(item.deadline || t("الموعد غير محدد", "No deadline"))}</small></article>`)}</div></section>
      <section id="institution-team" class="institution-management"><div class="section-heading"><span class="rafid-kicker">${t("الحوكمة", "Governance")}</span><h2>${t("الأقسام، المراكز، والمدعوون", "Departments, centers, and invitees")}</h2></div><div class="institution-grid"><form id="addDepartment" class="institution-card"><h3>${t("إضافة قسم أو مركز", "Add a department or center")}</h3><label>${t("الاسم", "Name")}<input name="name" required maxlength="160" /></label><label>${t("النوع", "Type")}<select name="kind"><option value="department">${t("قسم", "Department")}</option><option value="center">${t("مركز", "Center")}</option><option value="program">${t("برنامج", "Program")}</option></select></label><button class="rafid-primary" type="submit">${t("إضافة", "Add")}</button><p role="alert"></p></form><form id="inviteMember" class="institution-card"><h3>${t("دعوة مدير أو مراجع", "Invite a manager or reviewer")}</h3><label>${t("البريد", "Email")}<input type="email" name="email" required /></label><label>${t("الدور", "Role")}<select name="role"><option value="program_manager">${t("مدير برنامج", "Program manager")}</option><option value="reviewer">${t("مراجع", "Reviewer")}</option><option value="viewer">${t("مشاهد", "Viewer")}</option><option value="admin">${t("مدير مساحة", "Workspace admin")}</option></select></label><button class="rafid-primary" type="submit">${t("إرسال الدعوة", "Send invite")}</button><p role="alert"></p></form></div><div class="compact-list">${data.departments.map((item) => `<article><b>${esc(item.name)}</b><span>${esc(item.kind)}</span></article>`).join("")}</div></section>
      ${pilotMarkup(org, data)}
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

  function downloadBlob(filename, type, parts) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(parts, { type }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function managementReportMarkup(org, data) {
    const d = data.dashboard || {};
    return `<main dir="${window.RafidI18n?.isEnglish() ? "ltr" : "rtl"}"><h1>${esc(t("تقرير محفظة", "Portfolio report"))}: ${esc(org.name)}</h1><p>${esc(t("أُنشئ من البيانات المنظمة في رافد، ولا يتضمن نصوص الأبحاث الخام.", "Generated from structured Rafid records and excludes raw research text."))}</p><section><h2>${esc(t("الملخص التنفيذي", "Executive summary"))}</h2><ul><li>${esc(t("المشاريع", "Projects"))}: ${data.projects.length}</li><li>${esc(t("الفرص", "Opportunities"))}: ${data.opportunities.length}</li><li>${esc(t("جولات التقييم", "Review rounds"))}: ${data.reviews.length}</li><li>${esc(t("مشاريع سريعة التجهيز", "Quick-preparation projects"))}: ${d.quick_projects?.length || 0}</li></ul></section><section><h2>${esc(t("المشاريع", "Projects"))}</h2><table><thead><tr><th>${esc(t("المشروع", "Project"))}</th><th>${esc(t("المجال", "Field"))}</th><th>${esc(t("تقني", "Technical"))}</th><th>${esc(t("تمويلي", "Funding"))}</th><th>${esc(t("الأدلة", "Evidence"))}</th></tr></thead><tbody>${data.projects.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.field || "—")}</td><td>${item.technical_score}</td><td>${item.funding_score}</td><td>${item.evidence_score}</td></tr>`).join("")}</tbody></table></section><section><h2>${esc(t("الفجوات المشتركة", "Shared gaps"))}</h2><ul>${(d.common_blockers || []).map((item) => `<li>${esc(item.blocker)} — ${item.total}</li>`).join("") || `<li>${esc(t("لا توجد بيانات كافية.", "Insufficient data."))}</li>`}</ul><h2>${esc(t("احتياجات التدريب", "Training needs"))}</h2><ul>${(d.training_needs || []).map((item) => `<li>${esc(item.need)} — ${item.total}</li>`).join("") || `<li>${esc(t("لا توجد بيانات كافية.", "Insufficient data."))}</li>`}</ul></section><footer>${esc(t("تقرير استرشادي داخلي — قرار الاعتماد للمؤسسة.", "Internal advisory report — approval remains with the institution."))}</footer></main>`;
  }

  function downloadExcel(org, data) {
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${managementReportMarkup(org, data)}</body></html>`;
    downloadBlob(`rafid-${org.slug}-management-report.xls`, "application/vnd.ms-excel;charset=utf-8", ["\ufeff", html]);
  }

  function printManagementReport(org, data) {
    const report = window.open("", "_blank");
    if (!report) throw new Error(t("اسمح بفتح نافذة التقرير ثم أعد المحاولة.", "Allow the report popup, then try again."));
    report.opener = null;
    report.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(org.name)} — Rafid</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#0b2d3a}main{max-width:980px;margin:auto}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccd9d7;padding:8px;text-align:start}h1,h2{color:#087f74}footer{margin-top:30px;border-top:1px solid #ccc;padding-top:12px}@media print{body{margin:0}}</style></head><body>${managementReportMarkup(org, data)}</body></html>`);
    report.document.close();
    report.focus();
    setTimeout(() => report.print(), 250);
  }

  function bindDashboard(root, org, data) {
    root.querySelector("#changeOrganization").addEventListener("click", () => { selectedOrganization = null; workspaceView(); });
    root.querySelector("#institutionSignout").addEventListener("click", () => { saveSession(null); selectedOrganization = null; authView(); });
    root.querySelector("#exportInstitutionExcel").addEventListener("click", () => downloadExcel(org, data));
    root.querySelector("#exportInstitutionPdf").addEventListener("click", () => printManagementReport(org, data));
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

    root.querySelector("#batchProjects").addEventListener("submit", async (event) => {
      event.preventDefault(); const form = event.currentTarget; const target = form.querySelector("p[role=alert]"); const button = form.querySelector("button"); button.disabled = true;
      try {
        const file = form.file.files[0]; const projects = parseProjectCsv(await file.text());
        const [batch] = await rest("rafid_project_batches", "?select=id", { method: "POST", prefer: "return=representation", body: { organization_id: org.id, label: form.label.value.trim(), source_filename: file.name.slice(0, 240), project_count: projects.length, created_by: session.user.id } });
        const departments = new Map(data.departments.map((item) => [item.name.toLowerCase(), item.id]));
        await rest("rafid_institution_projects", "", { method: "POST", prefer: "return=minimal", body: projects.map((item) => ({ organization_id: org.id, batch_id: batch.id, title: item.title, field: item.field, readiness_stage: item.readiness_stage, department_id: item.department_name ? departments.get(item.department_name.toLowerCase()) || null : null, raw_content_stored: false, created_by: session.user.id })) });
        await dashboardView(org);
      } catch (error) { target.textContent = error.message; target.classList.add("is-error"); button.disabled = false; }
    });

    bind("#assignProject", "rafid_project_assignments", (form) => ({ organization_id: org.id, project_id: form.project_id.value, user_id: form.user_id.value, assignment_role: form.assignment_role.value, assigned_by: session.user.id }));
    bind("#addReview", "rafid_project_reviews", (form) => ({ organization_id: org.id, project_id: form.project_id.value, opportunity_id: form.opportunity_id.value || null, round_number: Number(form.round_number.value), eligibility: form.eligibility.value, readiness_score: Number(form.readiness_score.value), evidence_score: Number(form.evidence_score.value), confidence_score: Number(form.confidence_score.value), review_status: "submitted", reviewer_comment: form.reviewer_comment.value.trim() || null, blockers: [], shared_gaps: [], training_needs: [], reviewed_by: session.user.id }));

    root.querySelector("#manageRole").addEventListener("submit", async (event) => {
      event.preventDefault(); const form = event.currentTarget; const target = form.querySelector("p[role=alert]");
      try { await rest("rafid_organization_members", `?organization_id=eq.${encodeURIComponent(org.id)}&user_id=eq.${encodeURIComponent(form.user_id.value)}`, { method: "PATCH", prefer: "return=minimal", body: { role: form.role.value } }); await dashboardView(org); }
      catch (error) { target.textContent = error.message; target.classList.add("is-error"); }
    });

    root.querySelectorAll(".revoke-invite").forEach((button) => button.addEventListener("click", async () => {
      await rest("rafid_organization_invites", `?id=eq.${encodeURIComponent(button.dataset.invite)}&organization_id=eq.${encodeURIComponent(org.id)}`, { method: "PATCH", prefer: "return=minimal", body: { revoked_at: new Date().toISOString(), revoked_by: session.user.id } }); await dashboardView(org);
    }));
    root.querySelectorAll(".approve-review").forEach((button) => button.addEventListener("click", async () => {
      await rest("rafid_project_reviews", `?id=eq.${encodeURIComponent(button.dataset.review)}&organization_id=eq.${encodeURIComponent(org.id)}`, { method: "PATCH", prefer: "return=minimal", body: { review_status: "approved", approved_at: new Date().toISOString(), approved_by: session.user.id } }); await dashboardView(org);
    }));
    root.querySelectorAll(".add-review-comment").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault(); const target = form.querySelector("p[role=alert]"); const button = form.querySelector("button[type=submit]"); button.disabled = true;
      try {
        await rest("rafid_review_comments", "", { method: "POST", prefer: "return=minimal", body: { organization_id: org.id, review_id: form.dataset.review, body: form.elements.body.value.trim(), comment_kind: form.elements.comment_kind.value, created_by: session.user.id } });
        await dashboardView(org);
      } catch (error) { target.textContent = error.message; target.classList.add("is-error"); button.disabled = false; }
    }));
  }

  function enhanceLanding() {
    const grid = document.querySelector(".service-grid");
    if (grid && !grid.querySelector("#startInstitution")) {
      const button = document.createElement("button");
      button.id = "startInstitution";
      button.className = "service-card institution-service";
      button.type = "button";
      button.innerHTML = `<span class="service-card-top"><span class="service-number">05</span><span class="service-status">${t("لدي مؤسسة ومحفظة مشاريع", "I manage an institution portfolio")}</span></span><strong>${t("رافد للمؤسسات البحثية", "Rafid for research institutions")}</strong><small>${t("أنشئ مساحة معزولة، أضف الأقسام والمشاريع، رتّب الأولويات، واكشف الفجوات واحتياجات التدريب.", "Create an isolated workspace, manage departments and projects, rank priorities, and identify shared gaps and training needs.")}</small><i>${t("فتح لوحة المؤسسة", "Open institution dashboard")} <b aria-hidden="true">←</b></i>`;
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
