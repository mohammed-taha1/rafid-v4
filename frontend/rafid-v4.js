"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const productConfig = globalThis.RafidConfig || { productName: "رافد", mvpMode: true, copy: {} };

const sameOriginEndpoint =
  typeof location !== "undefined" && /^https?:\/\//i.test(String(location.origin || ""))
    ? `${location.origin}/api/rafid`
    : "";
const isLoopbackPage = ["127.0.0.1", "localhost", "::1"].includes(
  String(typeof location !== "undefined" ? location.hostname || "" : "").toLowerCase(),
);

const state = {
  schemaVersion: "rafid-workspace-v4",
  opportunity: null,
  projects: [],
  selectedProjectId: null,
  workspaceClassification: "internal",
  endpoint: isLoopbackPage
    ? sameOriginEndpoint
    : localStorage.getItem("rafidV4Endpoint") || sameOriginEndpoint,
  accessToken: sessionStorage.getItem("rafidV4AccessToken") || "",
};

let pendingPrivacyRequest = null;
let runtimeConfig = {
  deployment_mode: "local",
  provider_configuration_mode: "local_session",
  limits: { max_file_size_mb: 20 },
  auth: { enabled: false, required: false, sign_in_providers: [] },
  workspace_sync: { enabled: false },
};
let supabaseClient = null;
let authSession = null;
let cloudWorkspaceLoaded = false;
let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let suppressCloudSave = false;

function uid(prefix = "id") {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : min;
}

function formatDate(value) {
  if (!value) return "غير محدد";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function daysUntil(value) {
  if (!value) return null;
  const end = new Date(`${String(value).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  $("#toastRegion").append(item);
  window.setTimeout(() => item.remove(), 4500);
}

function setBusy(active, title = productConfig.copy.busyTitle || "يحلل رافد المحتوى...", message = productConfig.copy.busyMessage || "يرتب الأدلة والتوصيات دون افتراضات.", percent = 12) {
  const overlay = $("#busyOverlay");
  overlay.hidden = !active;
  if (active) {
    $("#busyTitle").textContent = title;
    $("#busyMessage").textContent = message;
    $("#busyBar").style.width = `${clamp(percent)}%`;
  }
}

function updateBusy(message, percent) {
  $("#busyMessage").textContent = message;
  $("#busyBar").style.width = `${clamp(percent)}%`;
}

function normalizeEndpoint(value) {
  let endpoint = String(value || "").trim().replace(/\/+$/, "");
  endpoint = endpoint.replace(/\/(health|extract|opportunity\/extract|opportunity\/assess)$/i, "");
  if (endpoint && !/\/api\/rafid$/i.test(endpoint)) endpoint += "/api/rafid";
  return endpoint;
}

function connectionConfig() {
  const endpoint = normalizeEndpoint($("#endpointInput").value || state.endpoint || sameOriginEndpoint);
  const token = $("#accessTokenInput").value || state.accessToken;
  if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
    throw new Error("خادم رافد غير محدد. شغّل npm.cmd run rafid أو أدخل عنوان الخادم في صفحة الاتصال.");
  }
  const endpointUrl = new URL(endpoint);
  if (
    endpointUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "::1"].includes(endpointUrl.hostname)
  ) {
    throw new Error("الاتصال غير المحلي يجب أن يستخدم HTTPS لحماية رمز الوصول والبيانات.");
  }
  state.endpoint = endpoint;
  state.accessToken = token;
  localStorage.setItem("rafidV4Endpoint", endpoint);
  if (token) sessionStorage.setItem("rafidV4AccessToken", token);
  return { endpoint, token };
}

async function apiRequest(path, body = null) {
  const { endpoint, token } = connectionConfig();
  const headers = { Accept: "application/json" };
  if (token) headers["x-rafid-access-token"] = token;
  if (runtimeConfig.auth?.required) {
    if (!supabaseClient) throw new Error("خدمة تسجيل الدخول غير جاهزة.");
    const { data } = await supabaseClient.auth.getSession();
    authSession = data?.session || null;
    if (!authSession?.access_token) {
      showAuthGate("انتهت الجلسة. سجّل الدخول للمتابعة.", true);
      throw new Error("سجّل الدخول للمتابعة.");
    }
    headers.Authorization = `Bearer ${authSession.access_token}`;
  }
  if (body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${endpoint}/${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("تعذر الوصول إلى خادم رافد. تحقق من العنوان وCORS والاتصال بالإنترنت.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `فشل الطلب برمز ${response.status}.`);
    error.code = payload.code;
    error.status = response.status;
    error.requestId = payload.request_id;
    throw error;
  }
  return payload;
}

function workspaceSnapshot() {
  return {
    schema_version: state.schemaVersion,
    saved_at: new Date().toISOString(),
    privacy_note: "لا يتضمن النصوص الخام أو مفاتيح API. يتضمن السجلات المنظمة وقرارات المراجعة فقط.",
    opportunity: state.opportunity,
    projects: state.projects,
    selected_project_id: state.selectedProjectId,
    workspace_classification: state.workspaceClassification,
  };
}

function resetWorkspaceState() {
  state.opportunity = null;
  state.projects = [];
  state.selectedProjectId = null;
  state.workspaceClassification = "internal";
}

function applyWorkspaceSnapshot(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.schema_version && payload.schema_version !== "rafid-workspace-v4") {
    throw new Error("إصدار مساحة العمل السحابية غير مدعوم.");
  }
  if (payload.opportunity) validateImportedOpportunity(payload.opportunity);
  const projects = asArray(payload.projects);
  projects.forEach((item) => validateImportedProject(item.projectData));
  state.opportunity = payload.opportunity || null;
  state.projects = projects.slice(0, 10).map((item) => ({
    id: item.id || uid("project"),
    projectData: item.projectData,
    sourceFiles: asArray(item.sourceFiles),
    assessment: item.assessment || null,
    review: item.review || {
      decision: "not_reviewed",
      notes: "",
      secondReviewerAgreement: "not_checked",
      submissionStatus: "not_submitted",
      startedAt: null,
      submittedAt: null,
      updatedAt: null,
    },
    createdAt: item.createdAt || new Date().toISOString(),
  }));
  state.selectedProjectId =
    state.projects.find((item) => item.id === payload.selected_project_id)?.id ||
    state.projects.find((item) => item.assessment)?.id ||
    null;
  state.workspaceClassification = ["public", "internal", "confidential", "restricted"].includes(
    payload.workspace_classification,
  )
    ? payload.workspace_classification
    : "internal";
  const classificationInput = $("#workspaceClassificationInput");
  if (classificationInput) classificationInput.value = state.workspaceClassification;
}

function setCloudSyncStatus(message, type = "neutral") {
  const target = $("#cloudSyncStatus");
  if (!target) return;
  target.textContent = message;
  target.dataset.state = type;
}

async function loadCloudWorkspace() {
  if (!supabaseClient || !authSession?.user?.id || !runtimeConfig.workspace_sync?.enabled) {
    cloudWorkspaceLoaded = false;
    return;
  }
  cloudWorkspaceLoaded = false;
  setCloudSyncStatus("يستعيد مساحة عملك…");
  const { data, error } = await supabaseClient
    .from("rafid_workspaces")
    .select("workspace,updated_at")
    .eq("user_id", authSession.user.id)
    .maybeSingle();
  if (error) {
    setCloudSyncStatus("تعذر الحفظ السحابي — راجع إعداد قاعدة البيانات", "error");
    toast("تم الدخول، لكن جدول حفظ مساحات العمل غير جاهز بعد.", "error");
    cloudWorkspaceLoaded = false;
    return;
  }
  try {
    suppressCloudSave = true;
    if (data?.workspace) applyWorkspaceSnapshot(data.workspace);
    else resetWorkspaceState();
    renderAll();
  } catch (error) {
    resetWorkspaceState();
    renderAll();
    toast(`تعذر استعادة المساحة المحفوظة: ${error.message}`, "error");
  } finally {
    suppressCloudSave = false;
    cloudWorkspaceLoaded = true;
  }
  if (data?.updated_at) {
    const time = new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.updated_at));
    setCloudSyncStatus(`محفوظ تلقائيًا · آخر مزامنة ${time}`, "saved");
  } else {
    setCloudSyncStatus("مساحة جديدة · سيبدأ الحفظ تلقائيًا");
    queueCloudSave();
  }
}

async function saveCloudWorkspace() {
  if (
    !supabaseClient ||
    !authSession?.user?.id ||
    !cloudWorkspaceLoaded ||
    cloudSaveInFlight ||
    suppressCloudSave ||
    !runtimeConfig.workspace_sync?.enabled
  ) return;
  if (
    state.workspaceClassification === "restricted" ||
    (state.workspaceClassification === "confidential" && !runtimeConfig.workspace_sync?.allow_confidential)
  ) {
    setCloudSyncStatus(
      state.workspaceClassification === "restricted"
        ? "الحفظ السحابي متوقف — المساحة مقيّدة"
        : "الحفظ السحابي متوقف — المساحة سرية",
      "blocked",
    );
    return;
  }
  const workspace = workspaceSnapshot();
  if (JSON.stringify(workspace).length > 1_500_000) {
    setCloudSyncStatus("المساحة كبيرة للحفظ التلقائي — صدّر نسخة", "error");
    return;
  }
  cloudSaveInFlight = true;
  setCloudSyncStatus("يحفظ التغييرات…");
  const { error } = await supabaseClient.from("rafid_workspaces").upsert(
    {
      user_id: authSession.user.id,
      workspace,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  cloudSaveInFlight = false;
  if (error) {
    setCloudSyncStatus("فشل الحفظ التلقائي — سيعاد عند التغيير التالي", "error");
    return;
  }
  const time = new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  setCloudSyncStatus(`محفوظ تلقائيًا · ${time}`, "saved");
}

function queueCloudSave() {
  if (!cloudWorkspaceLoaded || suppressCloudSave || !authSession?.user?.id) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(saveCloudWorkspace, 850);
}

function raiseWorkspaceClassification(classification) {
  const rank = { public: 0, internal: 1, confidential: 2, restricted: 3 };
  if (!(classification in rank)) return;
  if (rank[classification] > rank[state.workspaceClassification] || !state.workspaceClassification) {
    state.workspaceClassification = classification;
    const input = $("#workspaceClassificationInput");
    if (input) input.value = classification;
  }
}

function handleWorkspaceClassificationChange(event) {
  state.workspaceClassification = event.target.value;
  if (
    state.workspaceClassification === "restricted" ||
    (state.workspaceClassification === "confidential" && !runtimeConfig.workspace_sync?.allow_confidential)
  ) {
    window.clearTimeout(cloudSaveTimer);
    setCloudSyncStatus("الحفظ السحابي متوقف لهذا التصنيف", "blocked");
    toast("لن تُرسل تغييرات هذه المساحة إلى Supabase. استخدم التصدير المحلي.", "info");
    return;
  }
  queueCloudSave();
}

function authDisplayName(user) {
  return String(
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "حسابي",
  );
}

function showAuthGate(message = "", isError = false) {
  $("#authGate").hidden = false;
  if (message) {
    $("#authMessage").textContent = message;
    $("#authMessage").classList.toggle("error", isError);
  }
}

function hideAuthGate() {
  $("#authGate").hidden = true;
  $("#authMessage").classList.remove("error");
}

function updateAccountUi(session) {
  const user = session?.user;
  $("#accountWrap").hidden = !user;
  if (!user) return;
  const name = authDisplayName(user);
  $("#accountName").textContent = name;
  $("#accountInitial").textContent = name.trim().slice(0, 1).toUpperCase() || "ح";
  $("#accountEmail").textContent = user.email || "حساب موثّق";
}

async function handleAuthSession(session) {
  const previousUserId = authSession?.user?.id || null;
  authSession = session || null;
  updateAccountUi(authSession);
  if (!authSession?.user) {
    cloudWorkspaceLoaded = false;
    resetWorkspaceState();
    renderAll();
    if (runtimeConfig.auth?.required) showAuthGate();
    return;
  }
  hideAuthGate();
  if (previousUserId !== authSession.user.id || !cloudWorkspaceLoaded) {
    await loadCloudWorkspace();
  }
  await testConnection(true);
}

function applyRuntimeUi() {
  if (productConfig.mvpMode) {
    ["#localProviderPanel", "#serverProviderPanel", "#advancedConnectionPanel"].forEach((selector) => {
      const panel = $(selector);
      if (panel) panel.hidden = true;
    });
    return;
  }
  const serverManaged = runtimeConfig.provider_configuration_mode === "server";
  $("#serverProviderPanel").classList.toggle("hidden", !serverManaged);
  $("#localProviderPanel").classList.toggle("hidden", serverManaged);
  $("#advancedConnectionPanel").classList.toggle(
    "hidden",
    runtimeConfig.deployment_mode === "shared" && Boolean(location.origin),
  );
  $("#settingsIntro").textContent = serverManaged
    ? "الحساب والدخول والحفظ تلقائية؛ مفتاح النموذج سر دائم في الخادم ولا يراه أي مستخدم."
    : "في التشغيل المحلي يمكنك إدارة المزود من جهازك فقط.";
  const providers = new Set(runtimeConfig.auth?.sign_in_providers || []);
  $$('[data-auth-provider]').forEach((button) => {
    button.hidden = !providers.has(button.dataset.authProvider);
  });
  $("#emailAuthForm").hidden = !providers.has("email");
}

async function loadRuntimeConfig() {
  if (!/^https?:\/\//i.test(String(location.origin || ""))) return;
  try {
    const response = await fetch(`${location.origin}/api/rafid/public/config`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok !== false) runtimeConfig = payload;
  } catch {
    runtimeConfig = {
      deployment_mode: "local",
      provider_configuration_mode: "local_session",
      limits: { max_file_size_mb: 20 },
      auth: { enabled: false, required: false, sign_in_providers: [] },
      workspace_sync: { enabled: false },
    };
  }
  applyRuntimeUi();
}

function readAuthCallback() {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash);
  return {
    code: search.get("code") || "",
    accessToken: hash.get("access_token") || "",
    refreshToken: hash.get("refresh_token") || "",
    error:
      search.get("error_description") ||
      hash.get("error_description") ||
      search.get("error") ||
      hash.get("error") ||
      "",
  };
}

function clearAuthCallbackFromUrl() {
  const url = new URL(location.href);
  ["code", "error", "error_code", "error_description"].forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  history.replaceState(null, "", `${url.pathname}${url.search}`);
}

async function initializeAuthentication() {
  if (!runtimeConfig.auth?.enabled) {
    if (runtimeConfig.auth?.required) {
      showAuthGate("إعداد تسجيل الدخول في الخادم غير مكتمل.", true);
    } else {
      hideAuthGate();
    }
    return;
  }
  if (!globalThis.rafidSupabase?.createClient) {
    showAuthGate("تعذر تحميل مكوّن تسجيل الدخول المحلي.", true);
    return;
  }

  // نستخدم PKCE للعمليات الجديدة، ونعالج أيضًا روابط implicit القديمة يدويًا.
  // detectSessionInUrl معطّل هنا حتى لا نعتمد على توقيت التهيئة التلقائية قبل تغيير hash.
  supabaseClient = globalThis.rafidSupabase.createClient(
    runtimeConfig.auth.supabase_url,
    runtimeConfig.auth.publishable_key,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    },
  );

  const callback = readAuthCallback();
  if (callback.error) {
    clearAuthCallbackFromUrl();
    showAuthGate(`رفض مزود الدخول العملية: ${callback.error}`, true);
    return;
  }

  let callbackSession = null;
  if (callback.code) {
    const { data, error } = await supabaseClient.auth.exchangeCodeForSession(callback.code);
    if (error) {
      clearAuthCallbackFromUrl();
      showAuthGate(error.message || "تعذر تحويل رمز الدخول إلى جلسة.", true);
      return;
    }
    callbackSession = data?.session || null;
  } else if (callback.accessToken && callback.refreshToken) {
    const { data, error } = await supabaseClient.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) {
      clearAuthCallbackFromUrl();
      showAuthGate(error.message || "تعذر حفظ جلسة الدخول في المتصفح.", true);
      return;
    }
    callbackSession = data?.session || null;
  }

  const sessionResult = callbackSession
    ? { data: { session: callbackSession }, error: null }
    : await supabaseClient.auth.getSession();

  if (sessionResult.error) {
    showAuthGate("تعذر استعادة جلسة الدخول. حاول تسجيل الدخول من جديد.", true);
    return;
  }

  if (callback.code || callback.accessToken) clearAuthCallbackFromUrl();

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => handleAuthSession(session), 0);
  });
  await handleAuthSession(sessionResult.data?.session || null);
}

async function signInWithProvider(provider) {
  if (!supabaseClient) return showAuthGate("خدمة تسجيل الدخول غير جاهزة.", true);
  $("#authMessage").textContent = "ينقلك رافد إلى مزود الهوية…";
  $("#authMessage").classList.remove("error");
  const redirectUrl = new URL(location.pathname || "/", location.origin);
  redirectUrl.search = "";
  redirectUrl.hash = "";
  const options = { redirectTo: redirectUrl.href };
  if (provider === "azure") options.scopes = "email";
  const { error } = await supabaseClient.auth.signInWithOAuth({ provider, options });
  if (error) showAuthGate(error.message || "تعذر بدء تسجيل الدخول.", true);
}

async function sendEmailLogin(event) {
  event.preventDefault();
  const email = $("#authEmailInput").value.trim();
  if (!email || !supabaseClient) return showAuthGate("أدخل بريدًا صحيحًا.", true);
  $("#authMessage").textContent = "يرسل رابط الدخول…";
  $("#authMessage").classList.remove("error");
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${location.origin}${location.pathname}`,
      shouldCreateUser: true,
    },
  });
  if (error) return showAuthGate(error.message || "تعذر إرسال رابط الدخول.", true);
  $("#authMessage").textContent = "أرسلنا رابطًا آمنًا إلى بريدك. افتحه على هذا الجهاز.";
}

async function signOut() {
  if (!supabaseClient) return;
  await saveCloudWorkspace();
  await supabaseClient.auth.signOut();
  authSession = null;
  cloudWorkspaceLoaded = false;
  resetWorkspaceState();
  renderAll();
  $("#accountMenu").hidden = true;
  showAuthGate("تم تسجيل الخروج من هذا الجهاز.");
}

const privacyDescriptions = {
  public: "محتوى منشور أو متاح للعامة. تبقى المعاينة مطلوبة، ويُنقح أي سر تقني أو معرف شخصي ظاهر.",
  internal: "محتوى عمل غير منشور. ينقح رافد المعرفات المباشرة ويرسل الحد الأدنى اللازم. هذا هو الخيار الافتراضي للتجربة.",
  confidential: "ملكية فكرية أو ميزانية أو بيانات حساسة. يتطلب ZDR مؤكدًا أو معالجة داخلية معتمدة بعد تنقيح مشدد.",
  restricted: "بيانات مقيّدة أو مشاركون/صحة أو أسرار لا يسمح بخروجها. يمنع رافد الاتصال الخارجي لهذه الفئة.",
};

const redactionLabels = {
  email: "بريد إلكتروني",
  phone: "هاتف",
  national_id: "هوية وطنية",
  iban: "آيبان",
  secret: "مفتاح أو رمز سري",
  identity: "هوية شخص",
  custom: "مصطلح مخصص",
};

function incrementCount(counts, key, amount = 1) {
  counts[key] = (counts[key] || 0) + amount;
}

function redactString(value, counts, customTerms) {
  let result = String(value);
  const patterns = [
    ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
    ["iban", /\bSA\d{22}\b/gi],
    ["national_id", /\b[12]\d{9}\b/g],
    ["phone", /(?<!\d)(?:\+?966[\s-]?|0)?5\d(?:[\s-]?\d){7}(?!\d)/g],
    ["secret", /\bsk-[A-Za-z0-9_-]{12,}\b/g],
    ["secret", /(api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]\s*["']?[^\s,"'}]{8,}/gi],
  ];
  for (const [key, pattern] of patterns) {
    result = result.replace(pattern, () => {
      incrementCount(counts, key);
      return `[محجوب:${redactionLabels[key]}]`;
    });
  }
  for (const term of customTerms) {
    if (!term || term.length < 2) continue;
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(pattern, () => {
      incrementCount(counts, "custom");
      return "[محجوب:مصطلح مخصص]";
    });
  }
  return result;
}

function redactPayload(payload, classification, customTerms) {
  const counts = {};
  const secretKey = /(^|_)(email|phone|mobile|national_?id|identity_?number|iban|api_?key|access_?token|token|secret|password)$/i;
  const personContext = /(project_owner|team_members|inventors|authors|contact_information|principal_investigator|metadata\.owner)/i;

  function walk(value, path = "") {
    if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}[${index}]`));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          const nextPath = path ? `${path}.${key}` : key;
          if (secretKey.test(key) && item !== null && String(item).trim()) {
            incrementCount(counts, /token|key|secret|password/i.test(key) ? "secret" : key.includes("email") ? "email" : key.includes("iban") ? "iban" : key.includes("id") ? "national_id" : "phone");
            return [key, `[محجوب:${key}]`];
          }
          if (
            ["internal", "confidential"].includes(classification) &&
            personContext.test(nextPath) &&
            /^(name|owner|researcher)$/i.test(key) &&
            item
          ) {
            incrementCount(counts, "identity");
            return [key, "[محجوب:هوية شخص]"];
          }
          return [key, walk(item, nextPath)];
        }),
      );
    }
    if (typeof value === "string") return redactString(value, counts, customTerms);
    if (typeof value === "number" && /^[12]\d{9}$/.test(String(value))) {
      incrementCount(counts, "national_id");
      return "[محجوب:هوية وطنية]";
    }
    return value;
  }

  return { payload: walk(payload), counts };
}

function privacyTerms() {
  return $("#customRedactionTerms").value
    .split(/[،,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function renderPrivacyPreview() {
  if (!pendingPrivacyRequest) return;
  const classification = $("#privacyClassification").value;
  const result = redactPayload(pendingPrivacyRequest.payload, classification, privacyTerms());
  pendingPrivacyRequest.preview = result;
  $("#privacyPolicyNote").textContent = privacyDescriptions[classification];
  $("#privacyPolicyNote").classList.toggle("blocked", classification === "restricted");
  $("#redactedPreview").value = privacyPreviewText(result.payload);
  const countEntries = Object.entries(result.counts);
  $("#redactionCounts").innerHTML = countEntries.length
    ? countEntries.map(([key, count]) => `<span>${esc(redactionLabels[key] || key)}: ${count}</span>`).join("")
    : "<span>لم تُكتشف معرفات مباشرة آليًا — راجع النص يدويًا</span>";
  $("#privacyConfirm").checked = false;
  $("#confirmPrivacyBtn").disabled = true;
  $("#confirmPrivacyBtn").textContent = classification === "restricted" ? "الإرسال محظور" : "تأكيد ومتابعة";
}

function privacyPreviewText(value, depth = 0) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => privacyPreviewText(item, depth + 1)).filter(Boolean).join("\n");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${"  ".repeat(depth)}${key}: ${privacyPreviewText(item, depth + 1)}`)
      .filter((line) => line.trim().length > 1)
      .join("\n");
  }
  return "";
}

function openPrivacyGate(payload, label = "هذه العملية") {
  return new Promise((resolve) => {
    pendingPrivacyRequest = { payload, label, resolve, preview: null };
    $("#privacyModalTitle").textContent = `راجع ما سيغادر جهازك — ${label}`;
    $("#privacyModal").hidden = false;
    document.body.style.overflow = "hidden";
    renderPrivacyPreview();
    $("#privacyClassification").focus();
  });
}

function closePrivacyGate(value = null) {
  if (!pendingPrivacyRequest) return;
  const resolve = pendingPrivacyRequest.resolve;
  pendingPrivacyRequest = null;
  $("#privacyModal").hidden = true;
  document.body.style.overflow = "";
  resolve(value);
}

function confirmPrivacyGate() {
  if (!pendingPrivacyRequest || !pendingPrivacyRequest.preview) return;
  const classification = $("#privacyClassification").value;
  if (classification === "restricted") {
    toast("المحتوى المقيّد يحتاج معالجة داخلية أو مراجعة بشرية، ولن يُرسل.", "error");
    return;
  }
  if (!$("#privacyConfirm").checked) return;
  const redactions = Object.entries(pendingPrivacyRequest.preview.counts).map(
    ([key, count]) => `${key}:${count}`,
  );
  closePrivacyGate({
    payload: pendingPrivacyRequest.preview.payload,
    privacy: {
      classification,
      remote_processing_confirmed: true,
      redaction_preview_confirmed: true,
      redactions_applied: redactions,
    },
  });
}

async function readPdf(file, progress) {
  try {
    window.pdfjsLib ||= await import("./vendor/pdf.min.mjs");
  } catch {
    throw new Error("قارئ PDF المحلي لم يُحمّل. شغّل رافد عبر npm.cmd run rafid أو استخدم TXT.");
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", location.href).href;
  const pdf = await window.pdfjsLib.getDocument({
    data: await file.arrayBuffer(),
    isEvalSupported: false,
  }).promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
    progress?.(`قراءة ${file.name}: صفحة ${index} من ${pdf.numPages}`);
  }
  return pages.join("\n\n");
}

async function readDocx(file) {
  if (!window.mammoth) throw new Error("قارئ Word المحلي لم يُحمّل. استخدم TXT أو الصق النص.");
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value || "";
}

function htmlToText(value) {
  const documentValue = new DOMParser().parseFromString(value, "text/html");
  documentValue.querySelectorAll("script,style,noscript").forEach((item) => item.remove());
  return documentValue.body?.innerText || "";
}

async function readOneFile(file, progress) {
  const configuredLimit = Number(runtimeConfig.limits?.max_file_size_mb || 20);
  const maxFileSizeMb = Number.isFinite(configuredLimit) ? configuredLimit : 20;
  if (file.size > maxFileSizeMb * 1024 * 1024) {
    throw new Error(`الملف ${file.name} أكبر من ${maxFileSizeMb} ميغابايت.`);
  }
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (extension === "pdf") return readPdf(file, progress);
  if (extension === "docx") return readDocx(file);
  const text = await file.text();
  return ["html", "htm"].includes(extension) ? htmlToText(text) : text;
}

async function readFiles(files, progress) {
  const items = [];
  for (const file of files) {
    const content = await readOneFile(file, progress);
    items.push(`\n===== ${file.name} =====\n${content}`);
  }
  return items.join("\n").trim();
}

function projectTitle(projectData) {
  return projectData?.project_identity?.project_title || "مشروع غير مسمى";
}

function projectOrganization(projectData) {
  return projectData?.project_identity?.university || "جهة غير محددة";
}

function projectStage(projectData) {
  return projectData?.project_stage?.current_stage || "غير محدد";
}

function validateImportedProject(projectData) {
  if (!projectData || typeof projectData !== "object") throw new Error("ملف المشروع لا يحتوي JSON صالحًا.");
  if (!projectData?.project_identity?.project_title) throw new Error("Project JSON لا يحتوي اسم مشروع.");
  if (!projectData?.problem?.problem_statement || !projectData?.solution?.solution_summary) {
    throw new Error("Project JSON يجب أن يحتوي problem.problem_statement وsolution.solution_summary.");
  }
}

function validateImportedOpportunity(opportunity) {
  if (!opportunity?.identity?.title) throw new Error("ملف الفرصة لا يحتوي identity.title.");
  if (!asArray(opportunity.requirements).length) throw new Error("ملف الفرصة لا يحتوي requirements.");
}

function addProject(projectData, sourceFiles = []) {
  validateImportedProject(projectData);
  if (state.projects.length >= 10) throw new Error("وصلت إلى حد التجربة: 10 مشاريع.");
  const duplicate = state.projects.some(
    (item) => projectTitle(item.projectData).trim() === projectTitle(projectData).trim(),
  );
  if (duplicate && !window.confirm("يوجد مشروع بالاسم نفسه. هل تريد إضافته كحالة مستقلة؟")) return null;
  const item = {
    id: uid("project"),
    projectData,
    sourceFiles: sourceFiles.map((item) => ({ name: item.name, type: item.type, size: item.size })),
    assessment: null,
    review: {
      decision: "not_reviewed",
      notes: "",
      secondReviewerAgreement: "not_checked",
      submissionStatus: "not_submitted",
      startedAt: null,
      submittedAt: null,
      updatedAt: null,
    },
    createdAt: new Date().toISOString(),
  };
  state.projects.push(item);
  renderAll();
  return item;
}

async function resolveOpportunitySource() {
  let sourceText = $("#oppSourceInput").value.trim();
  if (sourceText.length >= 100) {
    return {
      sourceText,
      sourceName: $("#oppFileStatus").dataset.fileName || "نص أدخله المستخدم",
    };
  }

  const url = $("#oppUrlInput").value.trim();
  if (!safeUrl(url)) {
    throw new Error("ألصق الرابط الرسمي أو أدخل 100 حرف على الأقل من نص الفرصة.");
  }
  setBusy(true, "يقرأ رافد المصدر الرسمي", "يجلب الصفحة العامة ويستبعد عناصرها البرمجية...", 10);
  const response = await apiRequest("source/fetch", { url });
  sourceText = response.source?.text || "";
  if (sourceText.length < 100) throw new Error("لم نحصل على نص رسمي كافٍ من الرابط.");
  $("#oppSourceInput").value = sourceText;
  if (!$("#oppTitleInput").value.trim() && response.source?.title) {
    $("#oppTitleInput").value = response.source.title;
  }
  if (response.source?.final_url) $("#oppUrlInput").value = response.source.final_url;
  $("#oppFileStatus").textContent = response.source?.truncated
    ? "قُرئت الصفحة تلقائيًا — اختُصر النص الطويل"
    : "قُرئت الصفحة الرسمية تلقائيًا";
  setBusy(false);
  return { sourceText, sourceName: response.source?.final_url || url };
}

async function extractOpportunity() {
  try {
    const resolvedSource = await resolveOpportunitySource();
    const payload = {
      metadata: {
        title: $("#oppTitleInput").value.trim() || null,
        funder: $("#oppFunderInput").value.trim() || null,
        official_source_url: $("#oppUrlInput").value.trim() || null,
        deadline: $("#oppDeadlineInput").value || null,
        source_name: resolvedSource.sourceName,
      },
      source_text: resolvedSource.sourceText,
    };
    const approved = await openPrivacyGate(payload, "استخراج فرصة التمويل");
    if (!approved) return;
    raiseWorkspaceClassification(approved.privacy.classification);
    setBusy(true, "يستخرج رافد شروط الفرصة", "يفصل البوابات الصارمة عن عوامل المفاضلة...", 22);
    const response = await apiRequest("opportunity/extract", {
      ...approved.payload,
      privacy: approved.privacy,
    });
    if (state.opportunity && state.projects.some((item) => item.assessment)) {
      state.projects.forEach((item) => { item.assessment = null; });
      toast("تغير مرجع القرار، لذلك أُلغيت المطابقات القديمة.");
    }
    state.opportunity = response.opportunity;
    $("#oppSourceInput").value = "";
    renderAll();
    toast("ثُبتت الفرصة تلقائيًا مع شروطها وبوابات أهليتها. مُسح النص الخام.", "success");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function extractProject() {
  try {
    if (!state.opportunity) throw new Error("ثبّت فرصة التمويل أولًا؛ المشروع لا يُقيّم في الفراغ.");
    if (state.projects.length >= 10) throw new Error("وصلت إلى حد التجربة: 10 مشاريع.");
    const rawText = $("#projectSourceInput").value.trim();
    if (rawText.length < 30) throw new Error("أدخل 30 حرفًا على الأقل من محتوى المشروع.");
    const files = [...($("#projectFileInput").files || [])].map((file) => ({
      name: file.name, type: file.type, size: file.size,
    }));
    const projectRequest = {
      schema_version: "rafid-project-data-v1",
      metadata: {
        title: $("#projectTitleInput").value.trim() || null,
        university: $("#projectOrgInput").value.trim() || null,
        owner: null,
        type: "مشروع بحثي أو ابتكاري",
      },
      files,
      raw_text: rawText,
    };
    const approved = await openPrivacyGate(
      { opportunity: state.opportunity, project_request: projectRequest },
      "استخراج المشروع ومطابقته تلقائيًا",
    );
    if (!approved) return;
    raiseWorkspaceClassification(approved.privacy.classification);
    setBusy(true, "يشغّل رافد التحليل الكامل", "1/2 — يستخرج الحقائق والأدلة دون افتراضات...", 18);
    const extraction = await apiRequest("extract", {
      ...approved.payload.project_request,
      privacy: approved.privacy,
    });
    const item = addProject(extraction.project_data, files);
    clearProjectForm();
    if (!item) return;
    updateBusy("2/2 — يطابق المشروع مع كل بوابة شرط ويولد خطة الإغلاق...", 62);
    const assessmentResponse = await apiRequest("opportunity/assess", {
      opportunity: approved.payload.opportunity,
      project_data: item.projectData,
      context: {
        assessment_date: new Date().toISOString().slice(0, 10),
        reviewer_role: "مكتب البحث والابتكار",
      },
      privacy: approved.privacy,
    });
    item.assessment = assessmentResponse.assessment;
    renderAll();
    openReview(item.id);
    toast("اكتمل تلقائيًا: استخراج المشروع، المطابقة، والقرار القابل للمراجعة.", "success");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function clearProjectForm() {
  $("#projectTitleInput").value = "";
  $("#projectOrgInput").value = "";
  $("#projectSourceInput").value = "";
  $("#projectFileInput").value = "";
  $("#projectFileStatus").textContent = "يمكن دمج عدة مرفقات";
}

async function assessProjects(projectIds = null) {
  try {
    if (!state.opportunity) throw new Error("لا توجد فرصة مثبتة.");
    const targets = state.projects.filter(
      (item) => (!projectIds || projectIds.includes(item.id)) && !item.assessment,
    );
    if (!targets.length) {
      toast("لا توجد مشاريع غير محسومة في هذا النطاق.");
      return;
    }
    const payloads = targets.map((item) => ({
      opportunity: state.opportunity,
      project_data: item.projectData,
      context: {
        assessment_date: new Date().toISOString().slice(0, 10),
        reviewer_role: "مكتب البحث والابتكار",
      },
    }));
    const approved = await openPrivacyGate({ requests: payloads }, `مطابقة ${targets.length} مشروع`);
    if (!approved) return;
    raiseWorkspaceClassification(approved.privacy.classification);
    const requests = approved.payload.requests;
    setBusy(true, "يحسم رافد الدفعة", `المشروع 1 من ${targets.length}`, 5);
    const failures = [];
    for (let index = 0; index < targets.length; index += 1) {
      const item = targets[index];
      updateBusy(
        `مطابقة ${projectTitle(item.projectData)} — ${index + 1} من ${targets.length}`,
        8 + ((index / targets.length) * 85),
      );
      try {
        const response = await apiRequest("opportunity/assess", {
          ...requests[index],
          privacy: approved.privacy,
        });
        item.assessment = response.assessment;
      } catch (error) {
        failures.push(`${projectTitle(item.projectData)}: ${error.message}`);
      }
    }
    renderAll();
    showView("portfolio");
    if (failures.length) {
      toast(`اكتملت الدفعة مع ${failures.length} حالة فاشلة. راجع الاتصال وأعد المحاولة.`, "error");
    } else {
      toast("اكتملت المطابقة وأصبحت كل نتيجة قابلة للتدقيق.", "success");
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function eligibilityClass(status) {
  return {
    "مؤهل": "eligible",
    "مؤهل بشروط": "conditional",
    "غير محسوم": "unknown",
    "غير مؤهل": "ineligible",
    "مستوفى": "eligible",
    "مستوفى جزئيًا": "conditional",
    "غير معروف": "unknown",
    "غير مستوفى": "ineligible",
    "جاهز": "eligible",
    "مسودة": "conditional",
    "ناقص": "ineligible",
  }[status] || "neutral";
}

function statusBadge(status) {
  return `<span class="status ${eligibilityClass(status)}">${esc(status || "غير محسم")}</span>`;
}

function opportunityHardGates() {
  return asArray(state.opportunity?.requirements).filter(
    (item) => item.requirement_type === "إلزامي" && item.gate_type === "بوابة صارمة",
  );
}

function renderOpportunity() {
  const empty = $("#oppEmptyState");
  const result = $("#oppResult");
  if (!state.opportunity) {
    empty.classList.remove("hidden");
    result.classList.add("hidden");
    return;
  }
  const opportunity = state.opportunity;
  const hard = opportunityHardGates();
  const deadlineDays = daysUntil(opportunity.identity?.deadline);
  const officialUrl = safeUrl(opportunity.identity?.official_source_url);
  empty.classList.add("hidden");
  result.classList.remove("hidden");
  result.innerHTML = `
    <div class="opp-identity">
      <span class="eyebrow">مرجع القرار الحالي</span>
      <h3>${esc(opportunity.identity?.title)}</h3>
      <p>${esc(opportunity.identity?.funder || "جهة التمويل غير محددة")}${officialUrl ? ` · <a href="${esc(officialUrl)}" target="_blank" rel="noopener">فتح المصدر الرسمي</a>` : ""}</p>
    </div>
    <div class="deadline-block"><span>موعد الإغلاق</span><b>${esc(formatDate(opportunity.identity?.deadline))}${deadlineDays !== null ? ` · ${deadlineDays >= 0 ? `${deadlineDays} يومًا` : "انتهت"}` : ""}</b></div>
    <div class="mini-kpis">
      <div><b>${hard.length}</b><span>بوابة أهلية</span></div>
      <div><b>${asArray(opportunity.submission_documents).filter((item) => item.mandatory).length}</b><span>وثيقة إلزامية</span></div>
      <div><b>${asArray(opportunity.missing_information).length}</b><span>سؤال غير محسوم</span></div>
    </div>
    <div class="requirement-preview"><b>أهم البوابات الصارمة</b>${hard.slice(0, 4).map((item) => `<div>${esc(item.title)}<q>${esc(item.source_quote || "لا يوجد اقتباس؛ يحتاج مراجعة")}</q></div>`).join("") || "<p class='microcopy'>لم تُحدد بوابات صارمة؛ راجع الاستخراج يدويًا.</p>"}</div>
    <div class="action-row"><button class="button ghost compact" type="button" id="goProjectsBtn">الانتقال إلى المشاريع</button><button class="button text-button" type="button" id="clearOpportunityBtn">استبدال الفرصة</button></div>
  `;
  $("#goProjectsBtn")?.addEventListener("click", () => showView("projects"));
  $("#clearOpportunityBtn")?.addEventListener("click", clearOpportunity);
}

function clearOpportunity() {
  if (!window.confirm("سيؤدي استبدال الفرصة إلى حذف كل المطابقات الحالية، مع بقاء المشاريع. هل تتابع؟")) return;
  state.opportunity = null;
  state.projects.forEach((item) => { item.assessment = null; });
  renderAll();
}

function renderProjects() {
  const count = state.projects.length;
  $("#projectCount").textContent = count;
  $("#projectCapacityBar").style.width = `${count * 10}%`;
  $("#projectsEmptyState").classList.toggle("hidden", count > 0);
  const cards = $("#projectCards");
  cards.innerHTML = state.projects.map((item) => {
    const assessment = item.assessment;
    return `<article class="project-card ${assessment ? "assessed" : ""}">
      <span class="eyebrow">${assessment ? "تمت المطابقة" : "بانتظار الحسم"}</span>
      <h3>${esc(projectTitle(item.projectData))}</h3>
      <p>${esc(projectOrganization(item.projectData))}</p>
      <div class="project-meta"><span>${esc(projectStage(item.projectData))}</span><span>${asArray(item.sourceFiles).length || asArray(item.projectData?.source_summary?.sources_reviewed).length} مرفقات</span>${assessment ? `<span>${esc(assessment.eligibility?.status)}</span>` : ""}</div>
      <div class="project-card-footer">
        <button class="small-link" type="button" data-project-action="${assessment ? "review" : "assess"}" data-project-id="${esc(item.id)}">${assessment ? "فتح ملف المراجعة" : "مطابقة الآن"}</button>
        <button class="small-link danger" type="button" data-project-action="remove" data-project-id="${esc(item.id)}">حذف</button>
      </div>
    </article>`;
  }).join("");
  $$('[data-project-action="remove"]', cards).forEach((button) => button.addEventListener("click", () => removeProject(button.dataset.projectId)));
  $$('[data-project-action="assess"]', cards).forEach((button) => button.addEventListener("click", () => assessProjects([button.dataset.projectId])));
  $$('[data-project-action="review"]', cards).forEach((button) => button.addEventListener("click", () => openReview(button.dataset.projectId)));
}

function removeProject(id) {
  const item = state.projects.find((project) => project.id === id);
  if (!item || !window.confirm(`حذف «${projectTitle(item.projectData)}» من هذه الدفعة؟`)) return;
  state.projects = state.projects.filter((project) => project.id !== id);
  if (state.selectedProjectId === id) state.selectedProjectId = null;
  renderAll();
}

function portfolioRank(status) {
  return { "مؤهل": 0, "مؤهل بشروط": 1, "غير محسوم": 2, "غير مؤهل": 3 }[status] ?? 9;
}

function sortedProjects() {
  return [...state.projects].sort((a, b) => {
    const rank = portfolioRank(a.assessment?.eligibility?.status) - portfolioRank(b.assessment?.eligibility?.status);
    return rank || ((b.assessment?.readiness?.opportunity_readiness_score || 0) - (a.assessment?.readiness?.opportunity_readiness_score || 0));
  });
}

function blockingGates(assessment) {
  return asArray(assessment?.hard_gates).filter(
    (gate) => !["مستوفى", "لا ينطبق"].includes(gate.status),
  );
}

function nextAction(assessment) {
  return asArray(assessment?.action_plan)[0]?.action || asArray(assessment?.gaps)[0]?.required_action || "تحتاج مراجعة بشرية";
}

function reviewLabel(review) {
  return {
    approved: "معتمد",
    changes_requested: "إعادة استكمال",
    rejected: "مرفوض مؤسسيًا",
    not_reviewed: "لم يراجع",
  }[review?.decision] || "لم يراجع";
}

function renderPortfolio() {
  const available = Boolean(state.opportunity && state.projects.length);
  $("#portfolioEmptyState").classList.toggle("hidden", available);
  $("#portfolioContent").classList.toggle("hidden", !available);
  if (!available) return;
  const assessed = state.projects.filter((item) => item.assessment);
  const reviewedItems = state.projects.filter((item) => item.review?.decision !== "not_reviewed");
  const turnaroundMinutes = reviewedItems
    .map((item) => {
      const start = new Date(item.review?.startedAt || item.createdAt).getTime();
      const end = new Date(item.review?.updatedAt).getTime();
      return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60000)) : null;
    })
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  const medianMinutes = turnaroundMinutes.length
    ? turnaroundMinutes[Math.floor(turnaroundMinutes.length / 2)]
    : null;
  const compared = state.projects.filter((item) => item.review?.secondReviewerAgreement && item.review.secondReviewerAgreement !== "not_checked");
  const agreement = compared.length
    ? Math.round((compared.filter((item) => item.review.secondReviewerAgreement === "agreed").length / compared.length) * 100)
    : null;
  const closedGaps = assessed.reduce((sum, item) => sum + asArray(item.assessment.gaps).filter((gap) => gap.status === "مغلقة").length, 0);
  const submitted = state.projects.filter((item) => item.review?.submissionStatus === "submitted");
  const submittedOnTime = submitted.filter((item) => {
    const submittedAt = new Date(item.review.submittedAt).getTime();
    const deadline = new Date(`${state.opportunity?.identity?.deadline || ""}T23:59:59`).getTime();
    return Number.isFinite(submittedAt) && Number.isFinite(deadline) && submittedAt <= deadline;
  }).length;
  $("#portfolioKpis").innerHTML = `
    <div class="kpi"><span>وسيط زمن القرار</span><b>${medianMinutes === null ? "—" : medianMinutes < 60 ? `${medianMinutes}د` : `${(medianMinutes / 60).toFixed(1)}س`}</b><small>من فتح المراجعة إلى حفظ القرار</small></div>
    <div class="kpi"><span>اتفاق مراجع ثانٍ</span><b>${agreement === null ? "—" : `${agreement}%`}</b><small>${compared.length ? `${compared.length} حالات مقارنة` : "لم تُسجل مقارنة بعد"}</small></div>
    <div class="kpi"><span>فجوات أُغلقت</span><b>${closedGaps}</b><small>إغلاق موثق لا مجرد توصية</small></div>
    <div class="kpi"><span>تقديم قبل الموعد</span><b>${submittedOnTime}/${submitted.length}</b><small>ملفات أُرسلت فعليًا في الوقت</small></div>`;
  $("#portfolioRows").innerHTML = sortedProjects().map((item) => {
    const assessment = item.assessment;
    if (!assessment) {
      return `<tr><td class="project-cell"><b>${esc(projectTitle(item.projectData))}</b><span>${esc(projectOrganization(item.projectData))}</span></td><td>${statusBadge("غير محسم")}</td><td>—</td><td>—</td><td>—</td><td>شغّل المطابقة</td><td><button class="small-link" data-row-action="assess" data-project-id="${esc(item.id)}">مطابقة</button></td></tr>`;
    }
    const score = clamp(assessment.readiness?.opportunity_readiness_score);
    const evidence = clamp(assessment.readiness?.evidence_strength_score);
    return `<tr>
      <td class="project-cell"><b>${esc(projectTitle(item.projectData))}</b><span>${esc(projectOrganization(item.projectData))}</span></td>
      <td>${statusBadge(assessment.eligibility?.status)}</td>
      <td><span class="score"><b>${score}</b><i><em style="width:${score}%"></em></i></span></td>
      <td><span class="blocker-count">${blockingGates(assessment).length}</span></td>
      <td>${evidence}%</td>
      <td title="${esc(nextAction(assessment))}">${esc(nextAction(assessment).slice(0, 48))}${nextAction(assessment).length > 48 ? "…" : ""}</td>
      <td><button class="small-link" data-row-action="review" data-project-id="${esc(item.id)}">${esc(reviewLabel(item.review))}</button></td>
    </tr>`;
  }).join("");
  $$('[data-row-action="assess"]').forEach((button) => button.addEventListener("click", () => assessProjects([button.dataset.projectId])));
  $$('[data-row-action="review"]').forEach((button) => button.addEventListener("click", () => openReview(button.dataset.projectId)));
}

function renderReviewPicker() {
  const picker = $("#reviewProjectSelect");
  const assessed = state.projects.filter((item) => item.assessment);
  picker.innerHTML = `<option value="">اختر مشروعًا محسمًا</option>${assessed.map((item) => `<option value="${esc(item.id)}" ${item.id === state.selectedProjectId ? "selected" : ""}>${esc(projectTitle(item.projectData))}</option>`).join("")}`;
}

function openReview(id) {
  state.selectedProjectId = id;
  const item = state.projects.find((project) => project.id === id);
  if (item?.review && !item.review.startedAt) item.review.startedAt = new Date().toISOString();
  renderReviewPicker();
  renderReview();
  showView("review");
}

function renderReview() {
  const item = state.projects.find((project) => project.id === state.selectedProjectId && project.assessment);
  $("#reviewEmptyState").classList.toggle("hidden", Boolean(item));
  $("#reviewContent").classList.toggle("hidden", !item);
  if (!item) {
    $("#reviewContent").innerHTML = "";
    return;
  }
  const assessment = item.assessment;
  const eligibility = assessment.eligibility || {};
  const readiness = assessment.readiness || {};
  const hardGates = asArray(assessment.hard_gates);
  const gaps = asArray(assessment.gaps);
  const actions = asArray(assessment.action_plan);
  const applicationPackage = asArray(assessment.application_package);
  const review = item.review || { decision: "not_reviewed", notes: "", secondReviewerAgreement: "not_checked", submissionStatus: "not_submitted" };
  $("#reviewContent").innerHTML = `
    <div class="review-summary">
      <article class="verdict-card">
        ${statusBadge(eligibility.status)}
        <h2>${esc(projectTitle(item.projectData))}</h2>
        <p>${esc(eligibility.reason || readiness.summary || "يحتاج القرار إلى مراجعة مؤسسية.")}</p>
        <div class="verdict-metrics"><div><b>${clamp(readiness.opportunity_readiness_score)}</b><span>جاهزية الفرصة</span></div><div><b>${clamp(readiness.evidence_strength_score)}</b><span>قوة الدليل</span></div><div><b>${clamp(readiness.assessment_confidence)}</b><span>ثقة التحليل</span></div></div>
      </article>
      <article class="next-actions-card">
        <div class="review-section-head"><div><span class="eyebrow">أقرب طريق للقرار</span><h2>الإجراءات ذات الأولوية</h2></div></div>
        ${actions.slice(0, 5).map((action, index) => `<div class="action-item"><span class="action-rank">${esc(action.priority || index + 1)}</span><div><b>${esc(action.action)}</b><p>${esc(action.output || action.why_now)}</p></div><time>${esc(formatDate(action.due_date))}</time></div>`).join("") || "<p class='microcopy'>لم يُقترح إجراء؛ راجع اكتمال التحليل.</p>"}
      </article>
    </div>

    <section class="review-section">
      <div class="review-section-head"><div><span class="eyebrow">الأهلية أولًا</span><h2>بوابات الشروط الصارمة</h2></div><span class="microcopy">${hardGates.length} بوابات · ${blockingGates(assessment).length} مفتوحة</span></div>
      <div class="table-scroll"><table class="gate-table"><thead><tr><th>الشرط</th><th>الحكم</th><th>أساس الحكم</th><th>الدليل الناقص</th><th>الإغلاق</th><th>المالك</th></tr></thead><tbody>${hardGates.map((gate) => `<tr><td><b>${esc(gate.requirement)}</b><q class="evidence-quote">${esc(gate.opportunity_source_quote)}</q></td><td>${statusBadge(gate.status)}</td><td>${esc(gate.verdict_basis)}</td><td>${esc(asArray(gate.missing_evidence).join("؛ ") || "لا شيء")}</td><td>${esc(gate.remediation || gate.resolution)}</td><td>${esc(gate.owner_role)}<br><span class="microcopy">${esc(formatDate(gate.due_date))}</span></td></tr>`).join("") || "<tr><td colspan='6'>لا توجد بوابات مستخرجة؛ يلزم تدقيق المصدر.</td></tr>"}</tbody></table></div>
    </section>

    <section class="review-section">
      <div class="review-section-head"><div><span class="eyebrow">من النقص إلى عمل</span><h2>سجل الفجوات</h2></div></div>
      <div class="gap-grid">${gaps.map((gap) => `<article class="gap-card ${gap.severity === "مانع" ? "severity-blocker" : gap.severity === "حرج" ? "severity-critical" : ""}"><span class="status ${gap.severity === "مانع" ? "ineligible" : "conditional"}">${esc(gap.severity)}</span><h3>${esc(gap.title)}</h3><p>${esc(gap.required_action)}</p><div class="gap-meta"><span>${esc(gap.owner_role)}</span><span>${esc(formatDate(gap.due_date))}</span><span>${esc(gap.status)}</span></div></article>`).join("") || "<p class='microcopy'>لا توجد فجوات مسجلة.</p>"}</div>
    </section>

    <section class="review-section">
      <div class="review-section-head"><div><span class="eyebrow">جاهزية الملف</span><h2>حزمة التقديم</h2></div></div>
      <div class="package-grid">${applicationPackage.map((documentItem) => `<article class="package-item">${statusBadge(documentItem.status)}<b>${esc(documentItem.document_name)}</b><span>${esc(documentItem.next_action || documentItem.available_evidence)}</span></article>`).join("") || "<p class='microcopy'>لم تُستخرج قائمة وثائق.</p>"}</div>
    </section>

    <section class="reviewer-box">
      <div><span class="eyebrow">قرار بشري ملزم</span><h2>مراجعة مكتب البحث</h2><p>هذا القرار منفصل عن توصية النموذج، ويظهر في لوحة الحسم والتصدير.</p></div>
      <div class="reviewer-form">
        <label>القرار
          <select id="reviewDecisionInput"><option value="not_reviewed" ${review.decision === "not_reviewed" ? "selected" : ""}>لم يراجع</option><option value="approved" ${review.decision === "approved" ? "selected" : ""}>اعتماد للتقديم</option><option value="changes_requested" ${review.decision === "changes_requested" ? "selected" : ""}>إعادة لاستكمال النواقص</option><option value="rejected" ${review.decision === "rejected" ? "selected" : ""}>عدم التقديم لهذه الدورة</option></select>
        </label>
        <label>ملاحظات المراجع
          <textarea id="reviewNotesInput" rows="4" placeholder="سبب القرار، ما يجب إغلاقه، ومن سيعتمد النسخة النهائية...">${esc(review.notes)}</textarea>
        </label>
        <div class="form-grid two">
          <label>مقارنة مراجع ثانٍ
            <select id="reviewAgreementInput"><option value="not_checked" ${review.secondReviewerAgreement === "not_checked" ? "selected" : ""}>لم تُجرَ مقارنة</option><option value="agreed" ${review.secondReviewerAgreement === "agreed" ? "selected" : ""}>متفق على الحكم</option><option value="disagreed" ${review.secondReviewerAgreement === "disagreed" ? "selected" : ""}>مختلف — يحتاج معايرة</option></select>
          </label>
          <label>حالة الإرسال للجهة
            <select id="submissionStatusInput"><option value="not_submitted" ${review.submissionStatus !== "submitted" ? "selected" : ""}>لم يُرسل</option><option value="submitted" ${review.submissionStatus === "submitted" ? "selected" : ""}>أُرسل فعليًا</option></select>
          </label>
        </div>
        <div class="action-row review-actions"><button class="button secondary" id="saveReviewBtn" type="button">حفظ القرار</button><button class="button ghost" id="printReviewBtn" type="button">طباعة التقرير</button><button class="button ghost" id="exportAssessmentBtn" type="button">تصدير JSON</button><button class="button text-button" id="reassessBtn" type="button">إعادة المطابقة</button></div>
      </div>
    </section>`;
  $("#saveReviewBtn").addEventListener("click", () => saveReview(item));
  $("#printReviewBtn").addEventListener("click", () => window.print());
  $("#exportAssessmentBtn").addEventListener("click", () => downloadJson(`${fileSlug(projectTitle(item.projectData))}-assessment.json`, { project_data: item.projectData, assessment: item.assessment, institutional_review: item.review }));
  $("#reassessBtn").addEventListener("click", () => {
    item.assessment = null;
    renderAll();
    assessProjects([item.id]);
  });
}

function saveReview(item) {
  const now = new Date().toISOString();
  const submissionStatus = $("#submissionStatusInput").value;
  const decision = $("#reviewDecisionInput").value;
  const notes = $("#reviewNotesInput").value.trim();
  if (submissionStatus === "submitted" && decision !== "approved") {
    toast("لا يمكن تسجيل الإرسال قبل اعتماد المشروع للتقديم.", "error");
    return;
  }
  if (
    decision === "approved" &&
    item.assessment?.eligibility?.status === "غير مؤهل" &&
    (notes.length < 20 || !window.confirm("التحليل يرى أن المشروع غير مؤهل. هل تؤكد تجاوز الحكم مع توثيق السبب في ملاحظاتك؟"))
  ) {
    toast("يتطلب تجاوز بوابة أهلية فاشلة سببًا موثقًا وتأكيدًا صريحًا.", "error");
    return;
  }
  item.review = {
    decision,
    notes,
    secondReviewerAgreement: $("#reviewAgreementInput").value,
    submissionStatus,
    startedAt: item.review?.startedAt || now,
    submittedAt: submissionStatus === "submitted" ? (item.review?.submittedAt || now) : null,
    updatedAt: now,
  };
  renderPortfolio();
  queueCloudSave();
  toast("حُفظ القرار المؤسسي داخل مساحة العمل الحالية.", "success");
}

function renderNavigationStates() {
  $("#navOpportunityState").classList.toggle("done", Boolean(state.opportunity));
  $("#navProjectsState").classList.toggle("done", state.projects.length > 0);
  $("#navPortfolioState").classList.toggle("done", state.projects.some((item) => item.assessment));
  $("#navReviewState").classList.toggle("done", state.projects.some((item) => item.review?.decision !== "not_reviewed"));
}

function renderAll() {
  renderOpportunity();
  renderProjects();
  renderPortfolio();
  renderReviewPicker();
  renderReview();
  renderNavigationStates();
  queueCloudSave();
}

function showView(name) {
  if (productConfig.mvpMode && name !== "opportunity") {
    toast(productConfig.copy.unsupportedLegacyView || "هذه الشاشة خارج نطاق النسخة الأولية الحالية.", "info");
    name = "opportunity";
  }
  $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === name));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.viewLink === name));
  history.replaceState(null, "", `#${name}`);
  $("#mainContent").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "review") renderReview();
}

function fileSlug(value) {
  return String(value || "rafid")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "rafid";
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportWorkspace() {
  downloadJson(`rafid-workspace-${new Date().toISOString().slice(0, 10)}.json`, {
    ...workspaceSnapshot(),
    exported_at: new Date().toISOString(),
  });
  toast("صُدّرت مساحة العمل دون النصوص الخام أو رمز الوصول.", "success");
}

async function importWorkspaceFile(file) {
  try {
    const payload = JSON.parse(await file.text());
    applyWorkspaceSnapshot(payload);
    renderAll();
    toast("استُعيدت مساحة العمل بنجاح.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

function demoRequirement(id, title, quote, evidence) {
  return {
    requirement_id: id,
    category: "أهلية مقدم الطلب",
    title,
    description: title,
    requirement_type: "إلزامي",
    gate_type: "بوابة صارمة",
    evidence_required: evidence,
    source_quote: quote,
    source_reference: "دليل المنحة التجريبي — قسم الأهلية",
  };
}

function demoProject(title, organization, stage, problem, solution, trl) {
  return {
    project_identity: {
      project_title: title,
      university: organization,
      project_owner: { name: "باحث تجريبي", email: null, phone: null },
      field: [], project_type: ["ابتكار جامعي"], team_members: [],
    },
    project_stage: { current_stage: stage, trl_estimate: trl, trl_reason: "وفق وصف النموذج والاختبارات", completed_work: [], remaining_work: [] },
    problem: { problem_statement: problem, problem_scale: "موثق مبدئيًا في ملف المشروع", supporting_evidence: [], who_experiences_the_problem: [], current_alternatives: [], limitations_of_current_alternatives: [] },
    solution: { solution_summary: solution, how_it_works: solution, main_components: [], innovation_or_differentiation: [], technical_architecture: [], dependencies: [], limitations: [] },
    prototype_and_data: { prototype_exists: trl >= 4, tests_completed: [], test_results: [], data_available: true, attachments_or_links: [] },
    budget: { requested_amount: 900000, currency: "ريال سعودي", budget_status: "تقديرية", budget_items: [] },
    funding_request: { funding_needed_for: ["اختبار ميداني وتحقق مستقل"] },
    source_summary: { sources_reviewed: ["مقترح المشروع التجريبي.pdf"], information_completeness: "متوسطة", extraction_confidence: 82, notes: "بيانات عرض توضيحي وليست فرصة حقيقية." },
  };
}

function demoGate(requirement, status, resolution, basis, remediation, owner = "الباحث الرئيس") {
  return {
    requirement_id: requirement.requirement_id,
    requirement: requirement.title,
    status,
    resolution,
    verdict_basis: basis,
    project_evidence: status === "مستوفى" ? [{ evidence: basis, source: "ملف المشروع التجريبي", strength: "صريح" }] : [],
    missing_evidence: status === "مستوفى" ? [] : requirement.evidence_required,
    remediation,
    owner_role: owner,
    due_date: "2026-08-20",
    opportunity_source_quote: requirement.source_quote,
  };
}

function clientEligibility(gates) {
  if (gates.some((gate) => gate.status === "غير مستوفى" && gate.resolution === "غير قابل للإصلاح لهذه الدورة")) {
    return { status: "غير مؤهل", can_submit_now: false, reason: "فشل المشروع بوابة أهلية صارمة لا يمكن إصلاحها في هذه الدورة." };
  }
  if (gates.some((gate) => gate.status === "غير معروف")) {
    return { status: "غير محسوم", can_submit_now: false, reason: "توجد بوابة أهلية لا يملك المشروع دليلًا كافيًا لحسمها." };
  }
  if (gates.some((gate) => !["مستوفى", "لا ينطبق"].includes(gate.status))) {
    return { status: "مؤهل بشروط", can_submit_now: false, reason: "يمكن استكمال الأهلية بعد إغلاق شروط محددة قبل الموعد." };
  }
  return { status: "مؤهل", can_submit_now: true, reason: "بوابات الأهلية الصارمة مستوفاة وفق الأدلة المتاحة." };
}

function demoAssessment(project, opportunity, gateStates, score, evidenceScore, gaps) {
  const gates = opportunity.requirements.map((requirement, index) => {
    const setting = gateStates[index] || ["غير معروف", "يحتاج تحقق", "لا يوجد دليل كافٍ.", "أرفق الدليل المطلوب."];
    return demoGate(requirement, ...setting);
  });
  return {
    assessment_id: uid("demo-assessment"),
    project_snapshot: { project_title: projectTitle(project), project_owner: "باحث تجريبي", organization: projectOrganization(project), project_stage: projectStage(project) },
    opportunity_snapshot: { opportunity_id: opportunity.identity.opportunity_id, title: opportunity.identity.title, funder: opportunity.identity.funder, deadline: opportunity.identity.deadline },
    eligibility: clientEligibility(gates),
    hard_gates: gates,
    fit_dimensions: [
      { dimension: "توافق النطاق", score: Math.max(30, score - 4), weight_percent: 30, rationale: "مقارنة مباشرة مع مجالات المنحة.", evidence: [], improvement: "تثبيت الأثر المستهدف." },
      { dimension: "الأدلة والاختبارات", score: evidenceScore, weight_percent: 30, rationale: "بحسب الاختبارات المرفقة.", evidence: [], improvement: "إرفاق نتائج مستقلة." },
      { dimension: "خطة التنفيذ", score: Math.max(35, score - 8), weight_percent: 20, rationale: "الخطة مبدئية.", evidence: [], improvement: "ربط المراحل بمخرجات." },
      { dimension: "الميزانية", score: Math.max(40, score - 12), weight_percent: 20, rationale: "الميزانية تقديرية.", evidence: [], improvement: "إرفاق أساس التكاليف." },
    ],
    readiness: { opportunity_readiness_score: score, evidence_strength_score: evidenceScore, assessment_confidence: 84, summary: "تحليل تجريبي يوضح فصل الأهلية عن الجاهزية." },
    gaps: gaps.map((gap, index) => ({ gap_id: `demo-gap-${index + 1}`, severity: gap[0], related_requirement_id: opportunity.requirements[gap[1]]?.requirement_id || "", title: gap[2], current_state: gap[3], required_action: gap[4], evidence_to_produce: [gap[5]], owner_role: gap[6], due_date: "2026-08-20", completion_criterion: gap[5], status: "مفتوحة" })),
    action_plan: gaps.map((gap, index) => ({ action_id: `demo-action-${index + 1}`, priority: index + 1, action: gap[4], why_now: "لإغلاق البوابة قبل الموعد الداخلي.", owner_role: gap[6], due_date: "2026-08-20", dependency: null, output: gap[5], related_gap_ids: [`demo-gap-${index + 1}`] })),
    application_package: opportunity.submission_documents.map((documentItem, index) => ({ document_id: documentItem.document_id, document_name: documentItem.name, mandatory: documentItem.mandatory, status: index === 0 ? "مسودة" : "ناقص", available_evidence: index === 0 ? "مسودة موجودة" : "", missing_content: index === 0 ? ["مواءمة مع معايير المنحة"] : ["المستند الكامل"], next_action: index === 0 ? "تحديث المسودة" : "إعداد المستند", owner_role: index === 0 ? "الباحث الرئيس" : "مكتب البحث" })),
    institutional_review: { recommendation: "يوصى بعد استكمال الشروط", rationale: "القرار النهائي ينتظر إغلاق البوابات.", questions_for_project_team: [], questions_for_funder: [], reviewer_attention_points: ["التحقق من الأدلة الأصلية"], institutional_review_required: true },
    risk_disclosures: ["هذه بيانات عرض مصطنعة، وليست قرار تمويل حقيقي."],
  };
}

function loadDemo() {
  const opportunity = {
    identity: { opportunity_id: "opp-demo-sustainability-2026", title: "منحة حلول الاستدامة الجامعية 2026 — عرض تجريبي", funder: "صندوق الابتكار المستدام — جهة افتراضية", program: "مسار التجارب الميدانية", official_source_url: null, announcement_date: "2026-07-01", deadline: "2026-09-15", status: "مفتوحة", country_or_region: "المملكة العربية السعودية", source_language: "العربية" },
    purpose_and_scope: { objectives: ["اختبار حلول جامعية ذات أثر ميداني"], priority_areas: ["المياه", "الطاقة", "الزراعة"], eligible_fields: ["الاستدامة"], eligible_project_types: ["تجربة ميدانية"], excluded_activities: ["الدراسات النظرية دون نموذج"], eligible_geographies: ["المملكة العربية السعودية"], minimum_trl: 4, maximum_trl: 7 },
    applicant_eligibility: { eligible_applicant_types: ["جامعة سعودية"], lead_applicant_requirements: [], consortium_or_partner_requirements: ["شريك تطبيق"], nationality_or_location_requirements: ["تنفيذ داخل المملكة"], prior_funding_or_experience_requirements: [] },
    funding_terms: { minimum_amount: 400000, maximum_amount: 1200000, currency: "ريال سعودي", maximum_funding_rate_percent: 80, co_funding_required: true, co_funding_description: "20% نقدي أو عيني موثق", minimum_duration_months: 9, maximum_duration_months: 18, eligible_costs: ["التجارب", "الأجهزة", "الباحثون"], ineligible_costs: ["الإنشاءات العامة"] },
    requirements: [
      demoRequirement("req-org", "أن يكون مقدم الطلب الرئيس جامعة سعودية", "يقتصر مقدم الطلب الرئيس على جامعة سعودية معتمدة.", ["خطاب اعتماد الجامعة"]),
      demoRequirement("req-scope", "أن يقع المشروع في المياه أو الطاقة أو الزراعة", "يجب أن يخدم المشروع أحد مجالات المياه أو الطاقة أو الزراعة.", ["ملخص يثبت توافق النطاق"]),
      demoRequirement("req-trl", "أن تكون الجاهزية التقنية بين TRL 4 وTRL 7", "المشروعات المؤهلة في مستوى جاهزية تقنية من 4 إلى 7.", ["دليل نموذج واختبارات"]),
      demoRequirement("req-partner", "وجود شريك تطبيق بخطاب التزام", "يلزم خطاب التزام موقع من شريك التطبيق.", ["خطاب التزام موقع"]),
      demoRequirement("req-cofund", "إثبات تمويل مشترك بنسبة 20%", "على مقدم الطلب إثبات مساهمة نقدية أو عينية لا تقل عن 20%.", ["خطاب التزام مالي وتقييم المساهمة العينية"]),
    ],
    submission_documents: [
      { document_id: "doc-proposal", name: "المقترح الفني", mandatory: true, description: "النموذج الرسمي", source_quote: "يرفق المقترح الفني", source_reference: "قسم التقديم" },
      { document_id: "doc-budget", name: "الميزانية التفصيلية", mandatory: true, description: "مع أساس التقدير", source_quote: "ميزانية مفصلة", source_reference: "قسم التقديم" },
      { document_id: "doc-partner", name: "خطاب شريك التطبيق", mandatory: true, description: "موقع ومعتمد", source_quote: "خطاب التزام", source_reference: "قسم الأهلية" },
    ],
    evaluation_criteria: [{ criterion_id: "crit-impact", name: "الأثر القابل للقياس", weight_percent: 35, description: "أثر ميداني موثق", source_quote: "35% للأثر", source_reference: "قسم التقييم" }],
    submission_process: { submission_channel: "بوابة إلكترونية افتراضية", required_steps: [], review_stages: ["فحص أهلية", "تحكيم فني"], expected_decision_date: "2026-11-30", contact_information: [] },
    contradictions: [], missing_information: [{ topic: "تقييم المساهمة العينية", question_for_funder: "ما منهج قبول القيمة العينية؟", why_it_matters: "لحسم التمويل المشترك", impact: "يؤثر في الجاهزية" }],
    source_summary: { source_name: "دليل افتراضي للعرض فقط", sections_reviewed: ["الأهلية", "التمويل", "التقديم"], information_completeness: "مرتفعة", extraction_confidence: 93, notes: "هذه الفرصة مصطنعة ولا يجوز التقديم عليها." },
  };

  const projectA = demoProject("ريّ ذكي يتنبأ باحتياج التربة", "جامعة الندى", "تجربة ميدانية", "هدر مياه الري في المزارع الصغيرة.", "حساسات ونموذج تنبؤ يضبط كميات الري.", 6);
  const projectB = demoProject("تشخيص مبكر لاعتلال الشبكية", "جامعة الندى", "نموذج أولي", "تأخر اكتشاف اعتلال الشبكية.", "نموذج رؤية حاسوبية لفرز الصور الطبية.", 5);
  const projectC = demoProject("تحلية شمسية معيارية للقرى", "جامعة الأفق", "تجربة مخبرية", "ارتفاع تكلفة معالجة المياه في التجمعات الصغيرة.", "وحدة تحلية حرارية تعمل بالطاقة الشمسية.", 4);

  const commonMet = ["مستوفى", "مغلق", "يوجد دليل صريح في ملف المشروع.", "لا يلزم إجراء."];
  const assessmentA = demoAssessment(projectA, opportunity, [commonMet, commonMet, commonMet, ["مستوفى جزئيًا", "قابل للإغلاق", "ذكر شريك تطبيق دون خطاب موقع.", "الحصول على خطاب التزام موقع."], ["غير معروف", "يحتاج تحقق", "ذُكرت مساهمة عينية دون تقييم مالي.", "اعتماد قيمة المساهمة العينية."]], 82, 71, [["حرج", 4, "التمويل المشترك غير مثبت", "مساهمة مذكورة دون تقييم", "إعداد خطاب التزام مالي", "خطاب موقع وتقييم مالي", "مكتب البحث"], ["مهم", 3, "خطاب الشريك غير مكتمل", "توجد مراسلات فقط", "تحويل المراسلات إلى خطاب رسمي", "خطاب شريك موقع", "الباحث الرئيس"]]);
  const assessmentB = demoAssessment(projectB, opportunity, [commonMet, ["غير مستوفى", "غير قابل للإصلاح لهذه الدورة", "المشروع صحي ولا يقع ضمن المجالات الثلاثة المحددة.", "اختيار فرصة صحية أخرى."], commonMet, ["غير معروف", "يحتاج تحقق", "لا يوجد شريك تطبيق مثبت.", "التحقق من متطلب الشريك."], ["غير معروف", "يحتاج تحقق", "لا يوجد دليل مساهمة.", "تحديد التمويل المشترك."]], 91, 86, [["مانع", 1, "نطاق المشروع خارج الفرصة", "المشكلة صحية", "إيقاف تجهيز الملف لهذه الفرصة والبحث عن مسار صحي", "اختيار فرصة بديلة", "مكتب البحث"]]);
  const assessmentC = demoAssessment(projectC, opportunity, [commonMet, commonMet, commonMet, ["مستوفى جزئيًا", "قابل للإغلاق", "يوجد شريك بلدي لكن الخطاب مسودة.", "اعتماد خطاب الشريك."], commonMet], 73, 62, [["حرج", 3, "خطاب شريك التطبيق مسودة", "الخطاب غير موقع", "توقيع الخطاب وتحديد موقع التجربة", "خطاب موقع وموقع ميداني", "مدير الشراكات"], ["مهم", 2, "اختبارات الأداء محدودة", "اختبار مخبري واحد", "إجراء اختبار تحقق مستقل", "تقرير نتائج مستقل", "الباحث الرئيس"]]);

  state.opportunity = opportunity;
  state.projects = [
    { id: "demo-project-a", projectData: projectA, sourceFiles: [{ name: "irrigation-proposal.pdf", type: "application/pdf", size: 410000 }], assessment: assessmentA, review: { decision: "changes_requested", notes: "إغلاق التمويل المشترك وخطاب الشريك قبل الموعد الداخلي.", secondReviewerAgreement: "agreed", submissionStatus: "not_submitted", startedAt: new Date(Date.now() - 42 * 60000).toISOString(), submittedAt: null, updatedAt: new Date().toISOString() }, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: "demo-project-b", projectData: projectB, sourceFiles: [{ name: "retina-project.docx", type: "application/docx", size: 280000 }], assessment: assessmentB, review: { decision: "rejected", notes: "مشروع قوي لكنه خارج نطاق هذه الفرصة؛ يوجّه لمسار صحي.", secondReviewerAgreement: "agreed", submissionStatus: "not_submitted", startedAt: new Date(Date.now() - 28 * 60000).toISOString(), submittedAt: null, updatedAt: new Date().toISOString() }, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: "demo-project-c", projectData: projectC, sourceFiles: [{ name: "solar-desalination.pdf", type: "application/pdf", size: 520000 }], assessment: assessmentC, review: { decision: "not_reviewed", notes: "", secondReviewerAgreement: "not_checked", submissionStatus: "not_submitted", startedAt: null, submittedAt: null, updatedAt: null }, createdAt: new Date(Date.now() - 86400000).toISOString() },
  ];
  state.selectedProjectId = "demo-project-a";
  renderAll();
  showView("portfolio");
  toast("حُمّلت بيانات مصطنعة تشرح المسار كاملًا. لا تمثل فرصة حقيقية.", "success");
}

async function handleOpportunityFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    $("#oppFileStatus").textContent = `يقرأ ${file.name} محليًا...`;
    const text = await readOneFile(file, (message) => { $("#oppFileStatus").textContent = message; });
    $("#oppSourceInput").value = text;
    $("#oppFileStatus").textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB · لم يُرفع بعد`;
    $("#oppFileStatus").dataset.fileName = file.name;
  } catch (error) {
    toast(error.message, "error");
    $("#oppFileStatus").textContent = "تعذرت القراءة";
  }
}

async function handleProjectFiles(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  try {
    $("#projectFileStatus").textContent = `يقرأ ${files.length} ملف محليًا...`;
    const text = await readFiles(files, (message) => { $("#projectFileStatus").textContent = message; });
    $("#projectSourceInput").value = text;
    $("#projectFileStatus").textContent = `${files.length} ملف · لم تُرفع بعد`;
  } catch (error) {
    toast(error.message, "error");
    $("#projectFileStatus").textContent = "تعذرت القراءة";
  }
}

async function importOpportunityJson(file) {
  try {
    const payload = JSON.parse(await file.text());
    const opportunity = payload.opportunity || payload;
    validateImportedOpportunity(opportunity);
    if (state.projects.some((item) => item.assessment)) state.projects.forEach((item) => { item.assessment = null; });
    state.opportunity = opportunity;
    renderAll();
    toast("استُوردت الفرصة المنظمة دون اتصال خارجي.", "success");
  } catch (error) { toast(error.message, "error"); }
}

async function importProjectJson(file) {
  try {
    const payload = JSON.parse(await file.text());
    addProject(payload.project_data || payload.projectData || payload, [{ name: file.name, type: file.type, size: file.size }]);
    toast("استُورد المشروع المنظم دون اتصال خارجي.", "success");
  } catch (error) { toast(error.message, "error"); }
}

function providerDefaultModel(provider) {
  if (provider === "groq") return "openai/gpt-oss-120b";
  if (provider === "ollama") return "gpt-oss:20b";
  return "gpt-5.6";
}

function renderProviderPolicyChoice() {
  const provider = $("#providerSelect").value;
  const mode = $("#providerDataPolicy").value;
  const local = provider === "ollama";
  const groq = provider === "groq";
  const strict = !local && mode === "strict_zdr";
  $("#cloudKeyWrap").classList.toggle("hidden", local);
  $("#cloudPolicyWrap").classList.toggle("hidden", local);
  $("#zdrConfirmedWrap").classList.toggle("hidden", local || !strict);
  $("#groqSetupNote").classList.toggle("hidden", !groq);
  $("#cloudKeyLabel").textContent = groq ? "مفتاح Groq API" : "مفتاح OpenAI API";
  $("#providerApiKeyInput").placeholder = groq
    ? "gsk_… ألصقه هنا محليًا فقط"
    : "sk-… ألصقه هنا محليًا فقط";
  $("#providerPolicyNote").classList.toggle("blocked", strict);
  $("#providerPolicyNote").textContent = local
    ? "المعالجة محلية عبر Ollama API على جهازك؛ لا يُرسل محتوى الفرصة أو المشروع إلى مزود سحابي. يلزم تثبيت Ollama وتنزيل النموذج أولًا."
    : groq && strict
      ? "Groq لا يحتفظ بطلبات الاستدلال افتراضيًا؛ ومع تفعيل ZDR لا يحتفظ بمحتوى الطلبات لأغراض الاعتمادية أو مراقبة الإساءة. تبقى بيانات استخدام وصفية بلا محتوى."
      : groq
        ? "Groq لا يحتفظ بطلبات الاستدلال افتراضيًا، لكنه قد يسجل المدخلات والمخرجات مؤقتًا عند أعطال الاعتمادية أو الاشتباه بإساءة الاستخدام لمدة تصل إلى 30 يومًا."
    : strict
      ? "الوضع الصارم يمنع التحليل ما لم يكن حساب API معتمدًا فعليًا لـ Zero Data Retention. store:false وحدها لا تكفي."
      : "الوضع القياسي يعطل التخزين التطبيقي عبر store:false ولا تُستخدم البيانات للتدريب افتراضيًا، لكن قد توجد سجلات مراقبة لدى المزود لمدة تصل إلى 30 يومًا.";
}

function handleProviderChoice() {
  const provider = $("#providerSelect").value;
  $("#providerModelInput").value = providerDefaultModel(provider);
  renderProviderPolicyChoice();
}

async function configureProvider() {
  const badge = $("#providerBadge");
  try {
    if (!/^https?:\/\//i.test(String(location.origin || ""))) {
      throw new Error("شغّل رافد عبر npm.cmd run rafid أولًا.");
    }
    const provider = $("#providerSelect").value;
    const apiKey = $("#providerApiKeyInput").value.trim();
    const dataPolicy = $("#providerDataPolicy").value;
    const zdrConfirmed = $("#zdrConfirmedInput").checked;
    if (provider !== "ollama" && apiKey.length < 10) {
      throw new Error(`ألصق مفتاح ${provider === "groq" ? "Groq" : "OpenAI"} API في الحقل المحلي.`);
    }
    if (provider !== "ollama" && dataPolicy === "strict_zdr" && !zdrConfirmed) {
      throw new Error("لا تؤكد ZDR إلا إذا كان مفعّلًا فعليًا لحساب API. وإلا اختر الوضع القياسي.");
    }
    if (
      provider !== "ollama" &&
      dataPolicy === "standard" &&
      !window.confirm(
        provider === "groq"
          ? "لم تفعّل ZDR. لا يحتفظ Groq بطلبات الاستدلال افتراضيًا، لكنه قد يسجل المحتوى مؤقتًا عند أعطال الاعتمادية أو الاشتباه بإساءة الاستخدام حتى 30 يومًا. هل تتابع؟"
          : "الوضع القياسي يستخدم store:false ولا يشارك البيانات للتدريب افتراضيًا، لكن قد يحتفظ المزود بسجلات مراقبة حتى 30 يومًا. هل تتابع؟",
      )
    ) return;

    badge.className = "status neutral";
    badge.textContent = "جارٍ التفعيل";
    const response = await fetch(`${location.origin}/api/rafid/local/configure`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        provider,
        api_key: apiKey,
        model: $("#providerModelInput").value.trim() || providerDefaultModel(provider),
        data_policy: dataPolicy,
        zero_data_retention_confirmed: zdrConfirmed,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "تعذر تفعيل المزود.");
    $("#providerApiKeyInput").value = "";
    state.endpoint = normalizeEndpoint(`${location.origin}/api/rafid`);
    $("#endpointInput").value = state.endpoint;
    localStorage.setItem("rafidV4Endpoint", state.endpoint);
    badge.className = "status eligible";
    badge.textContent = provider === "ollama"
      ? "مفعّل · محلي"
      : provider === "groq" && dataPolicy === "strict_zdr"
        ? "مفعّل · Groq ZDR"
        : dataPolicy === "strict_zdr" ? "مفعّل · ZDR" : "مفعّل · قياسي";
    toast(
      provider === "ollama"
        ? "تفعّل النموذج المحلي. لن يغادر محتوى التحليل جهازك."
        : provider === "groq"
          ? "تحقق رافد من مفتاح Groq والنموذج. المفتاح في ذاكرة الخادم لهذه الجلسة فقط."
          : "تفعّل الذكاء الاصطناعي لهذه الجلسة، ولم يُحفظ المفتاح على الجهاز أو المتصفح.",
      "success",
    );
    await testConnection(true);
  } catch (error) {
    badge.className = "status ineligible";
    badge.textContent = "لم يُفعّل";
    toast(error.message, "error");
  }
}

async function testConnection(silent = false) {
  const badge = $("#connectionBadge");
  try {
    badge.className = "status neutral";
    badge.textContent = "جارٍ الاختبار";
    const response = await apiRequest("health");
    const ready = response.ready !== false && response.provider?.configured !== false;
    badge.className = ready ? "status eligible" : "status conditional";
    badge.textContent = ready
      ? `${response.version} · ${response.provider?.provider || "متصل"}`
      : `${response.version} · يحتاج مفتاح API`;
    if (ready) {
      $("#providerBadge").className = "status eligible";
      $("#providerBadge").textContent = response.provider?.provider === "ollama"
        ? "مفعّل · محلي"
        : response.provider?.provider === "groq" && response.provider?.data_policy?.zero_data_retention_confirmed
          ? "مفعّل · Groq ZDR"
        : response.provider?.data_policy?.zero_data_retention_confirmed
          ? "مفعّل · ZDR"
          : "مفعّل · قياسي";
      if (runtimeConfig.provider_configuration_mode === "server") {
        $("#serverProviderBadge").className = "status eligible";
        $("#serverProviderBadge").textContent = "جاهز للجميع";
        $("#managedProviderName").textContent = `${response.provider?.provider || "AI"} · ${response.provider?.model || "نموذج خادمي"}`;
        $("#managedPolicyNote").textContent = response.provider?.data_policy?.zero_data_retention_confirmed
          ? "وضع Zero Data Retention مؤكد في إعداد الخادم. تبقى بيانات الاستخدام الوصفية لدى المزود وفق سياسته."
          : "المزود خادمي، لكن ZDR غير مؤكد. راجع إعداد الخادم قبل إدخال محتوى سري.";
      }
    }
    if (!silent) {
      toast(
        ready ? "الخادم والذكاء الاصطناعي جاهزان." : "خادم رافد يعمل؛ بقي تفعيل مفتاح API لهذه الجلسة.",
        ready ? "success" : "info",
      );
    }
  } catch (error) {
    badge.className = "status ineligible";
    badge.textContent = "فشل الاتصال";
    if (runtimeConfig.provider_configuration_mode === "server") {
      $("#serverProviderBadge").className = "status ineligible";
      $("#serverProviderBadge").textContent = "غير جاهز";
    }
    if (!silent) toast(error.message, "error");
  }
}

function bindEvents() {
  $$('[data-auth-provider]').forEach((button) => button.addEventListener("click", () => signInWithProvider(button.dataset.authProvider)));
  $("#emailAuthForm").addEventListener("submit", sendEmailLogin);
  $("#signOutBtn").addEventListener("click", signOut);
  $("#accountButton").addEventListener("click", () => {
    const menu = $("#accountMenu");
    menu.hidden = !menu.hidden;
    $("#accountButton").setAttribute("aria-expanded", String(!menu.hidden));
  });
  $("#testManagedConnectionBtn").addEventListener("click", () => testConnection(false));
  $$('[data-view-link]').forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    showView(button.dataset.viewLink);
  }));
  $("#loadDemoBtn").addEventListener("click", () => {
    if ((state.opportunity || state.projects.length) && !window.confirm("سيستبدل العرض التجريبي مساحة العمل الحالية غير المصدرة. هل تتابع؟")) return;
    loadDemo();
  });
  $("#exportWorkspaceBtn").addEventListener("click", exportWorkspace);
  $("#importWorkspaceBtn").addEventListener("click", () => $("#workspaceImportInput").click());
  $("#workspaceImportInput").addEventListener("change", (event) => event.target.files?.[0] && importWorkspaceFile(event.target.files[0]));
  $("#extractOpportunityBtn").addEventListener("click", extractOpportunity);
  $("#extractProjectBtn").addEventListener("click", extractProject);
  $("#clearProjectFormBtn").addEventListener("click", clearProjectForm);
  $("#assessAllBtn").addEventListener("click", () => assessProjects());
  $("#oppFileInput").addEventListener("change", handleOpportunityFile);
  $("#projectFileInput").addEventListener("change", handleProjectFiles);
  $("#oppJsonInput").addEventListener("change", (event) => event.target.files?.[0] && importOpportunityJson(event.target.files[0]));
  $("#projectJsonInput").addEventListener("change", (event) => event.target.files?.[0] && importProjectJson(event.target.files[0]));
  $("#reviewProjectSelect").addEventListener("change", (event) => {
    if (event.target.value) openReview(event.target.value);
    else {
      state.selectedProjectId = null;
      renderReview();
    }
  });
  $("#configureProviderBtn").addEventListener("click", configureProvider);
  $("#providerSelect").addEventListener("change", handleProviderChoice);
  $("#providerDataPolicy").addEventListener("change", renderProviderPolicyChoice);
  $("#workspaceClassificationInput").addEventListener("change", handleWorkspaceClassificationChange);
  $("#testConnectionBtn").addEventListener("click", () => testConnection(false));
  $("#clearSessionTokenBtn").addEventListener("click", () => {
    state.accessToken = "";
    $("#accessTokenInput").value = "";
    sessionStorage.removeItem("rafidV4AccessToken");
    toast("نُسي رمز الوصول من هذه الجلسة.");
  });
  $("#endpointInput").addEventListener("change", (event) => {
    state.endpoint = normalizeEndpoint(event.target.value);
    event.target.value = state.endpoint;
    if (state.endpoint) localStorage.setItem("rafidV4Endpoint", state.endpoint);
  });
  $("#accessTokenInput").addEventListener("change", (event) => {
    state.accessToken = event.target.value;
    if (state.accessToken) sessionStorage.setItem("rafidV4AccessToken", state.accessToken);
  });
  $("#privacyClassification").addEventListener("change", renderPrivacyPreview);
  $("#customRedactionTerms").addEventListener("input", renderPrivacyPreview);
  $("#privacyConfirm").addEventListener("change", (event) => {
    $("#confirmPrivacyBtn").disabled = !event.target.checked || $("#privacyClassification").value === "restricted";
  });
  $("#confirmPrivacyBtn").addEventListener("click", confirmPrivacyGate);
  $("#cancelPrivacyBtn").addEventListener("click", () => closePrivacyGate(null));
  $("#closePrivacyModalBtn").addEventListener("click", () => closePrivacyGate(null));
  $("#privacyModal").addEventListener("click", (event) => {
    if (event.target === $("#privacyModal")) closePrivacyGate(null);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#privacyModal").hidden) closePrivacyGate(null);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#accountWrap")) {
      $("#accountMenu").hidden = true;
      $("#accountButton").setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveCloudWorkspace();
  });
}

async function init() {
  $("#endpointInput").value = state.endpoint;
  $("#accessTokenInput").value = state.accessToken;
  $("#workspaceClassificationInput").value = state.workspaceClassification;
  bindEvents();
  renderProviderPolicyChoice();
  renderAll();

  const hashValue = location.hash.slice(1);
  const requestedView = !productConfig.mvpMode && ["opportunity", "projects", "portfolio", "review", "settings"].includes(hashValue)
    ? hashValue
    : "opportunity";

  // لا تغيّر query/hash قبل أن ينتهي Supabase من معالجة رجوع OAuth.
  await loadRuntimeConfig();
  await initializeAuthentication();
  showView(requestedView);

  if (!runtimeConfig.auth?.required && !authSession) await testConnection(true);
}

document.addEventListener("DOMContentLoaded", () => init().catch((error) => {
  showAuthGate(error.message || "تعذر بدء رافد.", true);
}));
