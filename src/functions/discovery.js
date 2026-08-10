"use strict";

const { app } = require("@azure/functions");
const { optionsResponse, jsonResponse, authorize, checkRateLimit, publicError } = require("../lib/http");
const { normalizePrivacy, assertInputSize, requestId } = require("../lib/privacy");
const { discoverOpportunities, publicCatalog } = require("../lib/funding-discovery");

async function catalogHandler(request) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  return jsonResponse(request, 200, { ok: true, ...publicCatalog() }, {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  });
}

async function discoveryHandler(request, context) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const auth = await authorize(request);
  if (!auth.ok) return jsonResponse(request, auth.statusCode || 401, { ok: false, error: auth.error, code: auth.code });
  const rate = checkRateLimit(request, auth, { countGlobal: false });
  if (!rate.ok) return jsonResponse(request, 429, { ok: false, error: "تم تجاوز حد الطلبات المؤقت.", code: "RAFID_USER_RATE_LIMIT" });
  const correlationId = requestId();
  const startedAt = Date.now();
  try {
    const body = await request.json();
    assertInputSize(body, "طلب اكتشاف الفرص");
    normalizePrivacy(body);
    if (!body?.project_data || typeof body.project_data !== "object") {
      const error = new Error("بيانات المشروع المنظمة مطلوبة لاكتشاف الفرص.");
      error.statusCode = 400;
      error.code = "RAFID_INVALID_PROJECT";
      throw error;
    }
    const result = discoverOpportunities(body.project_data, body.filters || {});
    context.log(`Rafid opportunity discovery completed: request_id=${correlationId}, matches=${result.matches.length}, duration_ms=${Date.now() - startedAt}`);
    return jsonResponse(request, 200, {
      ok: true,
      result,
      meta: { request_id: correlationId, duration_ms: Date.now() - startedAt, provider: "deterministic", stored: false },
    });
  } catch (error) {
    context.error("Rafid opportunity discovery failed", { request_id: correlationId, code: error?.code || "RAFID_DISCOVERY_FAILED" });
    return jsonResponse(request, Number(error?.statusCode || 500), {
      ok: false,
      error: publicError(error),
      code: error?.code || "RAFID_DISCOVERY_FAILED",
      request_id: correlationId,
    });
  }
}

app.http("rafidFundingCatalog", {
  route: "rafid/opportunities/catalog",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: catalogHandler,
});

app.http("rafidOpportunityDiscovery", {
  route: "rafid/opportunities/discover",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: discoveryHandler,
});

module.exports = { catalogHandler, discoveryHandler };
