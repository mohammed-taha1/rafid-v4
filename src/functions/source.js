"use strict";

const { app } = require("@azure/functions");
const { optionsResponse, jsonResponse, authorize, checkRateLimit, publicError } = require("../lib/http");
const { fetchPublicSource } = require("../lib/source");

async function sourceHandler(request) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const auth = await authorize(request);
  if (!auth.ok) return jsonResponse(request, auth.statusCode || 401, { ok: false, error: auth.error, code: auth.code });
  const rate = checkRateLimit(request, auth, { countGlobal: false });
  if (!rate.ok) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return jsonResponse(
      request,
      429,
      { ok: false, error: "تم تجاوز حد جلب المصادر مؤقتًا.", retry_after_seconds: retryAfter },
      { "Retry-After": String(retryAfter) },
    );
  }
  try {
    const body = await request.json();
    const source = await fetchPublicSource(body?.url);
    return jsonResponse(request, 200, { ok: true, source });
  } catch (error) {
    const status = Number(error?.statusCode || error?.status || 0);
    return jsonResponse(request, [400, 413, 422, 502].includes(status) ? status : 500, {
      ok: false,
      error: publicError(error),
      code: error?.code || "RAFID_SOURCE_FETCH_FAILED",
    });
  }
}

app.http("rafidSourceFetch", {
  route: "rafid/source/fetch",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: sourceHandler,
});

module.exports = { sourceHandler };
