"use strict";

const crypto = require("node:crypto");

const verifiedSessions = new Map();
const allowedProviders = new Set(["google", "azure", "github", "email"]);

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function getHeader(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const target = String(name).toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  const value = entry?.[1];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const publishableKey = String(
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
  ).trim();
  let validUrl;
  try {
    const parsed = new URL(url);
    validUrl = parsed.protocol === "https:";
    if (
      envFlag("RAFID_TEST_MODE") &&
      parsed.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname.toLowerCase())
    ) {
      validUrl = true;
    }
  } catch {
    validUrl = false;
  }
  return {
    url,
    publishableKey,
    configured: Boolean(validUrl && publishableKey.length >= 20),
  };
}

function authRequired() {
  return envFlag("RAFID_AUTH_REQUIRED", false);
}

function providerConfigurationMode() {
  return String(process.env.RAFID_PROVIDER_CONFIGURATION_MODE || "local_session").toLowerCase() ===
    "server"
    ? "server"
    : "local_session";
}

function configuredProviders() {
  const values = String(process.env.RAFID_AUTH_PROVIDERS || "google,azure,github,email")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => allowedProviders.has(value));
  return [...new Set(values.length ? values : ["email"])];
}

function publicRuntimeConfig() {
  const supabase = supabaseConfig();
  const required = authRequired();
  return {
    version: "4.3.0",
    deployment_mode:
      String(process.env.RAFID_DEPLOYMENT_MODE || "local").toLowerCase() === "shared"
        ? "shared"
        : "local",
    provider_configuration_mode: providerConfigurationMode(),
    auth: {
      enabled: supabase.configured,
      required,
      ready: !required || supabase.configured,
      provider: supabase.configured ? "supabase" : null,
      supabase_url: supabase.configured ? supabase.url : null,
      publishable_key: supabase.configured ? supabase.publishableKey : null,
      sign_in_providers: supabase.configured ? configuredProviders() : [],
      persist_session: supabase.configured,
    },
    workspace_sync: {
      enabled: supabase.configured,
      table: supabase.configured ? "rafid_workspaces" : null,
      raw_content_persisted: false,
      allow_confidential: envFlag("RAFID_ALLOW_CONFIDENTIAL_CLOUD_PERSISTENCE", false),
    },
  };
}

function bearerToken(headers) {
  const authorization = getHeader(headers, "authorization");
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : "";
}

function cacheKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cachedPrincipal(token) {
  const key = cacheKey(token);
  const cached = verifiedSessions.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    verifiedSessions.delete(key);
    return null;
  }
  return cached.principal;
}

function rememberPrincipal(token, principal) {
  if (verifiedSessions.size > 2_000) {
    const now = Date.now();
    for (const [key, value] of verifiedSessions) {
      if (value.expiresAt <= now) verifiedSessions.delete(key);
    }
    if (verifiedSessions.size > 2_000) verifiedSessions.delete(verifiedSessions.keys().next().value);
  }
  verifiedSessions.set(cacheKey(token), {
    principal,
    expiresAt: Date.now() + 30_000,
  });
}

async function verifySupabaseToken(token) {
  const cached = cachedPrincipal(token);
  if (cached) return cached;
  const config = supabaseConfig();
  if (!config.configured) {
    const error = new Error("تسجيل الدخول مطلوب، لكن إعداد Supabase في الخادم غير مكتمل.");
    error.statusCode = 503;
    error.code = "RAFID_AUTH_NOT_CONFIGURED";
    throw error;
  }

  let response;
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      method: "GET",
      redirect: "error",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    const error = new Error("تعذر التحقق من جلسة المستخدم الآن. حاول مرة أخرى.");
    error.statusCode = 503;
    error.code = "RAFID_AUTH_UNAVAILABLE";
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    const error = new Error("انتهت جلسة الدخول أو لم تعد صالحة. سجّل الدخول من جديد.");
    error.statusCode = 401;
    error.code = "RAFID_AUTH_SESSION_INVALID";
    throw error;
  }
  if (!response.ok) {
    const error = new Error("رفض خادم الهوية التحقق من الجلسة مؤقتًا.");
    error.statusCode = 503;
    error.code = "RAFID_AUTH_UNAVAILABLE";
    throw error;
  }
  const user = await response.json().catch(() => ({}));
  if (!user?.id) {
    const error = new Error("لم تُرجع جلسة الدخول هوية مستخدم صالحة.");
    error.statusCode = 401;
    error.code = "RAFID_AUTH_SESSION_INVALID";
    throw error;
  }
  const principal = {
    mode: "supabase",
    user: {
      id: String(user.id),
      email: user.email ? String(user.email) : null,
    },
  };
  rememberPrincipal(token, principal);
  return principal;
}

async function authorizeHeaders(headers) {
  if (authRequired()) {
    const token = bearerToken(headers);
    if (!token) {
      return {
        ok: false,
        statusCode: 401,
        code: "RAFID_LOGIN_REQUIRED",
        error: "سجّل الدخول للمتابعة.",
      };
    }
    try {
      return { ok: true, ...(await verifySupabaseToken(token)) };
    } catch (error) {
      return {
        ok: false,
        statusCode: error.statusCode || 401,
        code: error.code || "RAFID_AUTH_SESSION_INVALID",
        error: error.message,
      };
    }
  }

  const expected = String(process.env.RAFID_ACCESS_TOKEN || "");
  if (!expected) return { ok: true, mode: "anonymous", user: null };
  const received = getHeader(headers, "x-rafid-access-token");
  const aa = Buffer.from(received);
  const bb = Buffer.from(expected);
  if (aa.length !== bb.length || !crypto.timingSafeEqual(aa, bb)) {
    return {
      ok: false,
      statusCode: 401,
      code: "RAFID_ACCESS_TOKEN_INVALID",
      error: "رمز الوصول إلى خادم رافد غير صحيح أو غير موجود.",
    };
  }
  return { ok: true, mode: "access_token", user: null };
}

function resetAuthCache() {
  verifiedSessions.clear();
}

module.exports = {
  authRequired,
  authorizeHeaders,
  configuredProviders,
  getHeader,
  providerConfigurationMode,
  publicRuntimeConfig,
  resetAuthCache,
  supabaseConfig,
};
