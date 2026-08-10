"use strict";

const { app } = require("@azure/functions");
const { optionsResponse, jsonResponse, authorize, checkRateLimit, publicError } = require("../lib/http");
const { normalizePrivacy, assertInputSize, requestId } = require("../lib/privacy");
const { comparePortfolio } = require("../lib/institutional-portfolio");

async function portfolioHandler(request, context) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const auth = await authorize(request);
  if (!auth.ok) return jsonResponse(request, auth.statusCode || 401, { ok: false, error: auth.error, code: auth.code });
  const rate = checkRateLimit(request, auth, { countGlobal: false });
  if (!rate.ok) return jsonResponse(request, 429, { ok: false, error: "تم تجاوز حد الطلبات المؤقت.", code: "RAFID_USER_RATE_LIMIT" });
  const correlationId = requestId();
  const startedAt = Date.now();
  try {
    const body = await request.json();
    assertInputSize(body, "طلب مقارنة المحفظة");
    normalizePrivacy(body);
    const result = comparePortfolio(body?.opportunity, body?.projects);
    context.log(`Rafid portfolio comparison completed: request_id=${correlationId}, projects=${result.summary.total_projects}, duration_ms=${Date.now() - startedAt}`);
    return jsonResponse(request, 200, {
      ok: true,
      result,
      meta: { request_id: correlationId, duration_ms: Date.now() - startedAt, provider: "deterministic", stored: false },
    });
  } catch (error) {
    context.error("Rafid portfolio comparison failed", { request_id: correlationId, code: error?.code || "RAFID_PORTFOLIO_FAILED" });
    const status = Number(error?.statusCode || 500);
    return jsonResponse(request, [400, 413, 422, 429].includes(status) ? status : 500, {
      ok: false,
      error: publicError(error),
      code: error?.code || "RAFID_PORTFOLIO_FAILED",
      request_id: correlationId,
    });
  }
}

app.http("rafidInstitutionalPortfolio", {
  route: "rafid/portfolio/compare",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: portfolioHandler,
});

module.exports = { portfolioHandler };
