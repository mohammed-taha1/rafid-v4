"use strict";

const dns = require("node:dns").promises;
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const frontendRoot = path.join(root, "frontend");

function loadEnvironmentFile(file) {
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvironmentFile(path.join(root, ".env"));

const { inspectEnvironment, logEnvironmentIssues } = require("../src/lib/env");
const environmentReport = logEnvironmentIssues(inspectEnvironment());

const {
  extractWithAI,
  extractOpportunityWithAI,
  assessWithAI,
  currentProviderStatus,
  resetAIClient,
} = require("../src/lib/ai");
const {
  normalizeProjectData,
  fallbackProjectData,
  validateProjectData,
} = require("../src/lib/normalize");
const {
  normalizeOpportunityData,
  validateOpportunityData,
} = require("../src/lib/opportunity-normalize");
const {
  fallbackAssessmentData,
  normalizeAssessmentData,
  validateAssessmentData,
} = require("../src/lib/assessment-normalize");
const {
  normalizePrivacy,
  assertInputSize,
  requestId,
} = require("../src/lib/privacy");
const {
  authorizeHeaders,
  providerConfigurationMode,
  publicRuntimeConfig,
  supabaseConfig,
} = require("../src/lib/auth");
const { checkRateLimit } = require("../src/lib/http");
const { analyzeResearch } = require("../src/lib/research-pipeline");
const { createGroqResearchProvider } = require("../src/lib/research-provider");

const version = "4.3.0";
const deploymentMode = String(process.env.RAFID_DEPLOYMENT_MODE || "local").toLowerCase();
const requestedHost = String(
  process.env.RAFID_HOST || (deploymentMode === "shared" ? "0.0.0.0" : "127.0.0.1"),
).trim();
const host = net.isIP(requestedHost) || requestedHost === "localhost" ? requestedHost : "127.0.0.1";
const port = Math.max(1, Number.parseInt(process.env.PORT || "8080", 10));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function securityHeaders(contentType = "application/json; charset=utf-8") {
  const authOrigin = (() => {
    try {
      return supabaseConfig().configured ? new URL(supabaseConfig().url).origin : "";
    } catch {
      return "";
    }
  })();
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:* http://localhost:*${authOrigin ? ` ${authOrigin}` : ""}; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, securityHeaders());
  response.end(JSON.stringify(payload));
}

function sendOptions(response) {
  response.writeHead(204, {
    ...securityHeaders(),
    "Access-Control-Allow-Origin": `http://${host}:${port}`,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,x-rafid-access-token",
  });
  response.end();
}

async function readJson(request) {
  const maxBytes = Math.max(
    50_000,
    Number.parseInt(process.env.RAFID_MAX_REQUEST_BYTES || "1500000", 10),
  );
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("الطلب أكبر من الحد المحلي المسموح.");
      error.statusCode = 413;
      error.code = "RAFID_REQUEST_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("جسم الطلب ليس JSON صالحًا.");
    error.statusCode = 400;
    error.code = "RAFID_INVALID_JSON";
    throw error;
  }
}

async function assertAccess(request) {
  const auth = await authorizeHeaders(request.headers);
  if (auth.ok) return auth;
  const error = new Error(auth.error || "سجّل الدخول للمتابعة.");
  error.statusCode = auth.statusCode || 401;
  error.code = auth.code || "RAFID_UNAUTHORIZED";
  throw error;
}

function assertRateLimit(request, auth, options = {}) {
  const rate = checkRateLimit(request, auth, options);
  if (rate.ok) return rate;
  const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
  const error = new Error(
    rate.scope === "global"
      ? "اكتملت حصة رافد المشتركة لهذا اليوم. حاول بعد تجدد الحد اليومي."
      : "وصل حسابك إلى حد الاستخدام المؤقت. انتظر قليلًا ثم أعد المحاولة.",
  );
  error.statusCode = 429;
  error.code = rate.scope === "global" ? "RAFID_GLOBAL_DAILY_LIMIT" : "RAFID_USER_RATE_LIMIT";
  error.retryAfter = retryAfter;
  throw error;
}

function normalizeOpportunityRequest(body) {
  if (!body || typeof body !== "object") throw new Error("جسم الطلب غير صالح.");
  assertInputSize(body, "طلب استخراج الفرصة");
  const sourceText = String(body.source_text || "").trim();
  if (sourceText.length < 100) {
    const error = new Error("نص الفرصة قصير جدًا. يلزم 100 حرف على الأقل من المصدر الرسمي.");
    error.statusCode = 400;
    throw error;
  }
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const privacy = normalizePrivacy(body);
  return { sourceText, metadata, privacy };
}

function normalizeProjectRequest(body) {
  if (!body || typeof body !== "object") throw new Error("جسم الطلب غير صالح.");
  assertInputSize(body, "طلب استخراج المشروع");
  const rawText = String(body.raw_text || "").trim();
  if (rawText.length < 30) {
    const error = new Error("النص المستخرج قصير جدًا. يلزم 30 حرفًا على الأقل.");
    error.statusCode = 400;
    throw error;
  }
  return {
    rawText,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    files: Array.isArray(body.files) ? body.files.slice(0, 30) : [],
    privacy: normalizePrivacy(body),
  };
}

function normalizeAssessmentRequest(body) {
  if (!body || typeof body !== "object") throw new Error("جسم الطلب غير صالح.");
  assertInputSize(body, "طلب مطابقة المشروع");
  const opportunity = normalizeOpportunityData(body.opportunity);
  const project = normalizeProjectData(body.project_data);
  const opportunityValidation = validateOpportunityData(opportunity);
  const projectValidation = validateProjectData(project);
  if (!opportunityValidation.valid || !projectValidation.valid) {
    const error = new Error(
      [...opportunityValidation.errors, ...projectValidation.errors].join(" ") ||
        "بيانات الفرصة أو المشروع غير صالحة.",
    );
    error.statusCode = 422;
    error.code = "RAFID_INVALID_ASSESSMENT_INPUT";
    throw error;
  }
  return {
    opportunity,
    project,
    context: body.context && typeof body.context === "object" ? body.context : {},
    privacy: normalizePrivacy(body),
  };
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  const normalized = String(address).toLowerCase();
  if (!net.isIPv6(normalized)) return true;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function assertPublicUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    const error = new Error("الرابط الرسمي غير صالح.");
    error.statusCode = 400;
    throw error;
  }
  if (url.protocol !== "https:") {
    const error = new Error("جلب المصادر التلقائي يقبل روابط HTTPS العامة فقط.");
    error.statusCode = 400;
    throw error;
  }
  if (url.username || url.password) {
    const error = new Error("لا يُسمح ببيانات دخول داخل رابط المصدر.");
    error.statusCode = 400;
    throw error;
  }
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    const error = new Error("لا يمكن جلب رابط داخلي أو خاص.");
    error.statusCode = 400;
    error.code = "RAFID_PRIVATE_URL_BLOCKED";
    throw error;
  }
  return url;
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function readableHtml(html) {
  const title = decodeEntities(
    String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "",
  )
    .replace(/\s+/g, " ")
    .trim();
  const text = decodeEntities(
    String(html)
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|canvas|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return { title, text };
}

async function fetchPublicSource(value) {
  let current = await assertPublicUrl(value);
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1",
        "User-Agent": "Rafid/4.3 opportunity-source-reader",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 4) throw new Error("تعذر اتباع تحويلات رابط المصدر.");
      current = await assertPublicUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) {
      const error = new Error(`تعذر قراءة المصدر الرسمي (HTTP ${response.status}).`);
      error.statusCode = 502;
      throw error;
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!/(text\/html|text\/plain|application\/json)/.test(contentType)) {
      const error = new Error("هذا الرابط ليس صفحة نصية. نزّل الدليل وارفع PDF أو DOCX إلى رافد.");
      error.statusCode = 422;
      throw error;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > 2_000_000) {
        const error = new Error("صفحة المصدر أكبر من حد الجلب التلقائي (2MB).");
        error.statusCode = 413;
        throw error;
      }
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsed = contentType.includes("text/html")
      ? readableHtml(raw)
      : { title: "", text: raw.trim() };
    if (parsed.text.length < 100) {
      const error = new Error("لم نجد نصًا كافيًا في الصفحة؛ قد تكون ديناميكية أو محمية. الصق النص أو ارفع الدليل.");
      error.statusCode = 422;
      throw error;
    }
    return {
      final_url: current.href,
      title: parsed.title || null,
      text: parsed.text.slice(0, 500_000),
      truncated: parsed.text.length > 500_000,
    };
  }
  throw new Error("تعذر قراءة المصدر الرسمي.");
}

function configureLocalProvider(body) {
  if (providerConfigurationMode() === "server") {
    const error = new Error("مزود الذكاء الاصطناعي مُدار من الخادم ولا يمكن للمستخدمين تغييره.");
    error.statusCode = 403;
    error.code = "RAFID_PROVIDER_SERVER_MANAGED";
    throw error;
  }
  if (!body || typeof body !== "object") throw new Error("إعداد المزود غير صالح.");
  const provider = String(body.provider || "openai").toLowerCase();
  const apiKey = String(body.api_key || "").trim();
  const dataPolicy = String(body.data_policy || "strict_zdr").toLowerCase();
  if (provider === "ollama") {
    process.env.AI_PROVIDER = "ollama";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
    process.env.OLLAMA_MODEL = String(body.model || "gpt-oss:20b").trim() || "gpt-oss:20b";
    process.env.RAFID_DATA_POLICY = "strict_zdr";
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;
    resetAIClient();
    return currentProviderStatus();
  }
  if (!apiKey || apiKey.length < 10) {
    const error = new Error("أدخل مفتاح API صالحًا. لن يُعاد عرضه أو حفظه في المتصفح.");
    error.statusCode = 400;
    throw error;
  }
  if (!["strict_zdr", "standard"].includes(dataPolicy)) {
    const error = new Error("وضع الخصوصية غير صالح.");
    error.statusCode = 400;
    throw error;
  }
  if (!["groq", "openai"].includes(provider)) {
    const error = new Error("الإعداد السريع يدعم Groq أو OpenAI أو Ollama المحلي؛ يمكن ضبط Azure عبر متغيرات الخادم.");
    error.statusCode = 400;
    throw error;
  }

  if (provider === "groq") {
    const model = String(body.model || "openai/gpt-oss-120b").trim() || "openai/gpt-oss-120b";
    if (!["openai/gpt-oss-120b", "openai/gpt-oss-20b"].includes(model)) {
      const error = new Error("اختر openai/gpt-oss-120b أو openai/gpt-oss-20b مع Groq.");
      error.statusCode = 400;
      throw error;
    }
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = apiKey;
    process.env.GROQ_MODEL = model;
    process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1";
    process.env.RAFID_DATA_POLICY = dataPolicy;
    process.env.GROQ_ZERO_DATA_RETENTION_CONFIRMED =
      body.zero_data_retention_confirmed === true ? "true" : "false";
    delete process.env.OPENAI_API_KEY;
    resetAIClient();
    return currentProviderStatus();
  }

  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = apiKey;
  process.env.OPENAI_MODEL = String(body.model || "gpt-5.6").trim() || "gpt-5.6";
  process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
  process.env.RAFID_DATA_POLICY = dataPolicy;
  process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED =
    body.zero_data_retention_confirmed === true ? "true" : "false";
  delete process.env.GROQ_API_KEY;
  resetAIClient();
  return currentProviderStatus();
}

async function assertGroqReady(model) {
  let response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    const error = new Error("تعذر الوصول إلى Groq. تحقق من الإنترنت ثم أعد التفعيل.");
    error.statusCode = 503;
    error.code = "RAFID_GROQ_UNAVAILABLE";
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    const error = new Error("مفتاح Groq غير صالح أو لا يملك صلاحية الوصول.");
    error.statusCode = 400;
    error.code = "RAFID_GROQ_KEY_REJECTED";
    throw error;
  }
  if (response.status === 429) {
    const error = new Error("بلغ حساب Groq حد الاستخدام مؤقتًا. انتظر المدة الظاهرة في لوحة Groq ثم أعد المحاولة.");
    error.statusCode = 429;
    error.code = "RAFID_GROQ_RATE_LIMITED";
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`رفض Groq اختبار الاتصال (HTTP ${response.status}).`);
    error.statusCode = 503;
    error.code = "RAFID_GROQ_UNAVAILABLE";
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  const models = Array.isArray(payload.data) ? payload.data.map((item) => String(item.id || "")) : [];
  if (!models.includes(model)) {
    const error = new Error(`النموذج ${model} غير متاح لهذا الحساب في Groq.`);
    error.statusCode = 503;
    error.code = "RAFID_GROQ_MODEL_MISSING";
    throw error;
  }
}

function clearFailedProvider(provider) {
  if (provider === "groq") delete process.env.GROQ_API_KEY;
  if (provider === "openai") delete process.env.OPENAI_API_KEY;
  resetAIClient();
}

async function assertOllamaReady(model) {
  let response;
  try {
    response = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    const error = new Error("Ollama غير مشغّل على الجهاز. افتحه ثم أعد التفعيل.");
    error.statusCode = 503;
    error.code = "RAFID_OLLAMA_UNAVAILABLE";
    throw error;
  }
  if (!response.ok) {
    const error = new Error("تعذر الوصول إلى Ollama المحلي.");
    error.statusCode = 503;
    error.code = "RAFID_OLLAMA_UNAVAILABLE";
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  const names = Array.isArray(payload.models)
    ? payload.models.flatMap((item) => [String(item.name || ""), String(item.model || "")])
    : [];
  if (!names.includes(model)) {
    const error = new Error(`النموذج ${model} غير موجود في Ollama. نفّذ: ollama pull ${model}`);
    error.statusCode = 503;
    error.code = "RAFID_OLLAMA_MODEL_MISSING";
    throw error;
  }
}

function errorStatus(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  if ([400, 401, 403, 413, 422, 429, 502, 503].includes(status)) return status;
  if (/قصير|غير صالح|مطلوب|يلزم|أدخل/.test(String(error?.message || ""))) return 400;
  return 500;
}

function publicError(error) {
  const status = errorStatus(error);
  if (String(error?.code || "").startsWith("RAFID_AUTH_") || error?.code === "RAFID_LOGIN_REQUIRED") {
    return String(error?.message || "سجّل الدخول للمتابعة.").slice(0, 300);
  }
  if (status === 401 || status === 403) {
    return "رفض مزود الذكاء الاصطناعي المفتاح أو الصلاحية. أنشئ مفتاحًا جديدًا وتحقق من دور الحساب.";
  }
  if (status === 429) {
    return "بلغت حد الاستخدام المجاني لدى المزود. انتظر حتى يتجدد الحد الظاهر في لوحة الحساب ثم أعد المحاولة؛ لم تُحفظ بيانات المشروع في رافد.";
  }
  if (status >= 500 && status !== 502 && status !== 503) {
    return "حدث خطأ مؤقت أثناء تشغيل رافد. حاول مرة أخرى.";
  }
  return String(error?.message || "خطأ غير معروف")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/gsk_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 700);
}

async function handleApi(request, response, pathname) {
  if (request.method === "OPTIONS") return sendOptions(response);
  if (request.method === "GET" && pathname === "/api/rafid/public/config") {
    return sendJson(response, 200, { ok: true, ...publicRuntimeConfig() });
  }
  const auth = await assertAccess(request);

  if (request.method === "GET" && pathname === "/api/rafid/health") {
    const provider = currentProviderStatus();
    const runtime = publicRuntimeConfig();
    const ready = provider.ready && runtime.auth.ready;
    return sendJson(response, ready ? 200 : 503, {
      ok: ready,
      ready,
      service: "Rafid Shared Opportunity Readiness",
      version,
      provider,
      auth: {
        required: runtime.auth.required,
        provider: runtime.auth.provider,
        authenticated: Boolean(auth.user?.id),
        user_id: auth.user?.id || null,
      },
      deployment_mode: runtime.deployment_mode,
      local_only: runtime.deployment_mode === "local",
      raw_content_persistence: false,
      workspace_sync: runtime.workspace_sync.enabled,
      endpoints: [
        "/api/rafid/public/config",
        "/api/rafid/source/fetch",
        "/api/rafid/opportunity/extract",
        "/api/rafid/extract",
        "/api/rafid/opportunity/assess",
      ],
    });
  }

  if (request.method !== "POST") return sendJson(response, 405, { ok: false, error: "الطريقة غير مدعومة." });
  const body = await readJson(request);

  if (pathname === "/api/rafid/local/configure") {
    const provider = configureLocalProvider(body);
    try {
      if (provider.provider === "ollama") await assertOllamaReady(provider.model);
      if (provider.provider === "groq") await assertGroqReady(provider.model);
    } catch (error) {
      clearFailedProvider(provider.provider);
      throw error;
    }
    return sendJson(response, 200, {
      ok: true,
      ready: provider.ready,
      provider,
      key_persisted: false,
      message: "فُعّل المزود لهذه الجلسة فقط، ولم يُحفظ المفتاح على القرص أو في المتصفح.",
    });
  }

  if (pathname === "/api/rafid/source/fetch") {
    assertRateLimit(request, auth, { countGlobal: false });
    const source = await fetchPublicSource(body.url);
    return sendJson(response, 200, { ok: true, source });
  }

  if (pathname === "/api/rafid/research/analyze") {
    assertRateLimit(request, auth);
    try {
      const result = await analyzeResearch(body, { provider: createGroqResearchProvider(), maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 20), maxAnalysisInputChars: Number(process.env.MAX_ANALYSIS_INPUT_CHARS || 16000), timeoutMs: Number(process.env.ANALYSIS_TIMEOUT_SECONDS || 60) * 1000 });
      return sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      return sendJson(response, error.statusCode || 503, { ok: false, code: error.code || "PROVIDER_UNAVAILABLE", error: error.message || "تعذر إكمال التحليل الآن." });
    }
  }

  if (pathname === "/api/rafid/opportunity/extract") {
    assertRateLimit(request, auth);
    const startedAt = Date.now();
    const input = normalizeOpportunityRequest(body);
    const ai = await extractOpportunityWithAI(input);
    const opportunity = normalizeOpportunityData(ai.opportunity, { metadata: input.metadata });
    const validation = validateOpportunityData(opportunity);
    return sendJson(response, validation.valid ? 200 : 422, {
      ok: validation.valid,
      opportunity,
      validation,
      extraction_meta: {
        backend_version: version,
        request_id: requestId(),
        provider: ai.provider,
        model: ai.model,
        input_truncated: ai.inputTruncated,
        duration_ms: Date.now() - startedAt,
        usage: ai.usage,
        data_policy: ai.dataPolicy,
      },
    });
  }

  if (pathname === "/api/rafid/extract") {
    assertRateLimit(request, auth);
    const startedAt = Date.now();
    const input = normalizeProjectRequest(body);
    let ai;
    let projectData;
    let fallbackReason = null;
    try {
      ai = await extractWithAI(input);
      projectData = normalizeProjectData(ai.project, {
        metadata: input.metadata,
        files: input.files,
      });
    } catch (error) {
      if (error?.code !== "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED") throw error;
      fallbackReason = error.code;
      projectData = fallbackProjectData(input.rawText, {
        metadata: input.metadata,
        files: input.files,
      });
      ai = {
        provider: "deterministic-fallback",
        model: null,
        responseId: null,
        inputTruncated: false,
        usage: null,
        dataPolicy: "no_additional_storage",
      };
    }
    const validation = validateProjectData(projectData);
    return sendJson(response, validation.valid ? 200 : 422, {
      ok: validation.valid,
      project_data: projectData,
      validation,
      extraction_meta: {
        backend_version: version,
        request_id: requestId(),
        provider: ai.provider,
        model: ai.model,
        input_truncated: ai.inputTruncated,
        duration_ms: Date.now() - startedAt,
        usage: ai.usage,
        data_policy: ai.dataPolicy,
        fallback_used: Boolean(fallbackReason),
        fallback_reason: fallbackReason,
      },
    });
  }

  if (pathname === "/api/rafid/opportunity/assess") {
    assertRateLimit(request, auth);
    const startedAt = Date.now();
    const input = normalizeAssessmentRequest(body);
    let ai;
    let assessmentData;
    let fallbackReason = null;
    try {
      ai = await assessWithAI(input);
      assessmentData = ai.assessment;
    } catch (error) {
      if (error?.code !== "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED") throw error;
      fallbackReason = error.code;
      assessmentData = fallbackAssessmentData(input);
      ai = {
        provider: "deterministic-fallback",
        model: null,
        inputTruncated: false,
        usage: null,
        dataPolicy: "no_additional_storage",
      };
    }
    const assessment = normalizeAssessmentData(assessmentData, input);
    const validation = validateAssessmentData(assessment);
    return sendJson(response, validation.valid ? 200 : 422, {
      ok: validation.valid,
      assessment,
      validation,
      assessment_meta: {
        backend_version: version,
        request_id: requestId(),
        provider: ai.provider,
        model: ai.model,
        input_truncated: ai.inputTruncated,
        duration_ms: Date.now() - startedAt,
        usage: ai.usage,
        data_policy: ai.dataPolicy,
        fallback_used: Boolean(fallbackReason),
        fallback_reason: fallbackReason,
      },
    });
  }

  return sendJson(response, 404, { ok: false, error: "نقطة API غير موجودة." });
}

function handleStatic(request, response, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(frontendRoot, relative);
  if (file !== frontendRoot && !file.startsWith(`${frontendRoot}${path.sep}`)) {
    response.writeHead(403, securityHeaders("text/plain; charset=utf-8")).end("Forbidden");
    return;
  }
  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404, securityHeaders("text/plain; charset=utf-8")).end("Not found");
      return;
    }
    const contentType = contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, securityHeaders(contentType));
    fs.createReadStream(file).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  try {
    if (pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "rafid", status: "healthy" });
      return;
    }
    if (pathname.startsWith("/api/rafid/")) {
      await handleApi(request, response, pathname);
      return;
    }
    handleStatic(request, response, pathname);
  } catch (error) {
    const correlationId = requestId();
    console.error(
      `Rafid request failed: request_id=${correlationId}, path=${pathname}, code=${error?.code || "RAFID_LOCAL_FAILED"}, status=${errorStatus(error)}`,
    );
    if (!response.headersSent) {
      sendJson(response, errorStatus(error), {
        ok: false,
        error: publicError(error),
        code: error?.code || "RAFID_LOCAL_FAILED",
        request_id: correlationId,
      });
    } else {
      response.end();
    }
  }
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`Rafid automatic: http://${displayHost}:${port}`);
  console.log(
    providerConfigurationMode() === "server"
      ? "The AI key is server-managed and is never sent to users or the frontend."
      : "The API key is read from memory/.env only and is never sent to the frontend.",
  );
  console.log(
    `Environment readiness: public_pages=${environmentReport.publicPagesReady}, auth=${environmentReport.authReady}, analysis=${environmentReport.analysisReady}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

module.exports = {
  isPrivateAddress,
  readableHtml,
  configureLocalProvider,
};
