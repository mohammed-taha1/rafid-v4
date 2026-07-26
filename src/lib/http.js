"use strict";

const { authRequired, authorizeHeaders, getHeader } = require("./auth");
const { rateLimitEnvironment } = require("./env");

const buckets = new Map();
let globalDailyUsage = { day: "", count: 0 };

function allowedOrigin(request) {
  const configured = String(process.env.RAFID_ALLOWED_ORIGINS || "*")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin") || "";
  if (configured.includes("*")) return "*";
  if (origin && configured.includes(origin)) return origin;
  return configured[0] || "*";
}

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,x-rafid-access-token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function jsonResponse(request, status, payload, extraHeaders = {}) {
  return {
    status,
    headers: { ...corsHeaders(request), ...extraHeaders },
    jsonBody: payload,
  };
}

function optionsResponse(request) {
  return {
    status: 204,
    headers: corsHeaders(request),
  };
}

async function authorize(request) {
  return authorizeHeaders(request?.headers);
}

function requestIp(request) {
  const forwarded = getHeader(request?.headers, "x-forwarded-for");
  return forwarded.split(",")[0].trim() || "unknown";
}

function checkRateLimit(request, principal = {}, options = {}) {
  const rateLimit = rateLimitEnvironment(authRequired());
  const limit = rateLimit.requests;
  const windowSeconds = rateLimit.windowSeconds;
  const now = Date.now();
  const identity = principal?.user?.id ? `user:${principal.user.id}` : `ip:${requestIp(request)}`;
  const key = identity;
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 0, resetAt: now + windowSeconds * 1000 });
  }
  const active = buckets.get(key);
  if (active.count >= limit) return { ok: false, remaining: 0, resetAt: active.resetAt, scope: "user" };

  const countGlobal = options.countGlobal !== false;
  const globalLimit = Math.max(
    0,
    Number.parseInt(process.env.RAFID_GLOBAL_DAILY_AI_LIMIT || (authRequired() ? "240" : "0"), 10),
  );
  if (countGlobal && globalLimit > 0) {
    const day = new Date(now).toISOString().slice(0, 10);
    if (globalDailyUsage.day !== day) globalDailyUsage = { day, count: 0 };
    if (globalDailyUsage.count >= globalLimit) {
      const resetAt = Date.parse(`${day}T23:59:59.999Z`) + 1;
      return { ok: false, remaining: 0, resetAt, scope: "global" };
    }
    globalDailyUsage.count += 1;
  }

  active.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, limit - active.count),
    resetAt: active.resetAt,
    scope: "user",
  };
}

function publicError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 401 || status === 403) {
    return "تعذر توثيق الاتصال بمزود الذكاء الاصطناعي. راجع المفتاح وإعدادات المزود.";
  }
  if (status === 429) {
    return "تم بلوغ حد الاستخدام لدى مزود الذكاء الاصطناعي. حاول لاحقًا أو راجع حدود الحساب.";
  }
  if (status >= 500) {
    return "حدث خطأ مؤقت لدى مزود الذكاء الاصطناعي. حاول مرة أخرى.";
  }
  const message = String(error?.message || "خطأ غير معروف");
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/gsk_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(api[_-]?key|token|secret)\s*[:=]\s*[^\s,}]+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

module.exports = {
  corsHeaders,
  jsonResponse,
  optionsResponse,
  authorize,
  checkRateLimit,
  publicError,
};
