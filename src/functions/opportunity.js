"use strict";

const { app } = require("@azure/functions");
const {
  optionsResponse,
  jsonResponse,
  authorize,
  checkRateLimit,
  publicError,
} = require("../lib/http");
const { extractOpportunityWithAI } = require("../lib/ai");
const {
  normalizeOpportunityData,
  validateOpportunityData,
  fallbackOpportunityData,
} = require("../lib/opportunity-normalize");
const {
  requestId,
  normalizePrivacy,
  assertInputSize,
} = require("../lib/privacy");

function normalizeOpportunityRequest(body) {
  if (!body || typeof body !== "object") throw new Error("جسم الطلب غير صالح.");
  assertInputSize(body, "طلب استخراج الفرصة");
  const sourceText = String(body.source_text || "").trim();
  if (sourceText.length < 100) {
    throw new Error("نص الفرصة قصير جدًا. يلزم 100 حرف على الأقل من المصدر الرسمي.");
  }
  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const privacy = normalizePrivacy(body);
  const outputLanguage = body.output_language === "en" ? "en" : "ar";
  return { sourceText, metadata, privacy, outputLanguage };
}

function errorStatus(error) {
  if (error instanceof SyntaxError) return 400;
  const status = Number(error?.statusCode || error?.status || 0);
  if ([400, 413, 422, 429].includes(status)) return status;
  if (status === 401 || status === 403) return 502;
  if (/قصير جدًا|غير صالح|يلزم/.test(String(error?.message || ""))) return 400;
  return 500;
}

async function opportunityHandler(request, context) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const auth = await authorize(request);
  if (!auth.ok) return jsonResponse(request, auth.statusCode || 401, { ok: false, error: auth.error, code: auth.code });
  const rate = checkRateLimit(request, auth);
  if (!rate.ok) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return jsonResponse(
      request,
      429,
      { ok: false, error: "تم تجاوز حد الطلبات المؤقت.", retry_after_seconds: retryAfter },
      { "Retry-After": String(retryAfter) },
    );
  }

  const startedAt = Date.now();
  const correlationId = requestId();
  try {
    const body = await request.json();
    const input = normalizeOpportunityRequest(body);
    context.log(
      `Rafid opportunity extraction started: request_id=${correlationId}, chars=${input.sourceText.length}, classification=${input.privacy.classification}`,
    );

    let ai;
    let opportunityData;
    let fallbackReason = null;
    try {
      ai = await extractOpportunityWithAI(input);
      opportunityData = ai.opportunity;
    } catch (error) {
      if (error?.code !== "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED") throw error;
      fallbackReason = error.code;
      opportunityData = fallbackOpportunityData(input.sourceText, { metadata: input.metadata });
      ai = {
        provider: "deterministic-fallback",
        model: null,
        responseId: null,
        inputTruncated: false,
        usage: null,
        dataPolicy: "no_additional_storage",
      };
    }
    const opportunity = normalizeOpportunityData(opportunityData, {
      metadata: input.metadata,
    });
    const validation = validateOpportunityData(opportunity);

    context.log(
      `Rafid opportunity extraction completed: request_id=${correlationId}, valid=${validation.valid}, requirements=${opportunity.requirements.length}, duration_ms=${Date.now() - startedAt}`,
    );
    return jsonResponse(request, validation.valid ? 200 : 422, {
      ok: validation.valid,
      opportunity,
      validation,
      extraction_meta: {
        backend_version: "4.3.0",
        request_id: correlationId,
        provider: ai.provider,
        model: ai.model,
        response_id: ai.responseId,
        input_truncated: ai.inputTruncated,
        duration_ms: Date.now() - startedAt,
        usage: ai.usage,
        data_policy: ai.dataPolicy,
        fallback_used: Boolean(fallbackReason),
        fallback_reason: fallbackReason,
      },
    });
  } catch (error) {
    context.error("Rafid opportunity extraction failed", {
      request_id: correlationId,
      name: error?.name,
      code: error?.code || "RAFID_OPPORTUNITY_EXTRACTION_FAILED",
    });
    return jsonResponse(request, errorStatus(error), {
      ok: false,
      error: publicError(error),
      code: error?.code || "RAFID_OPPORTUNITY_EXTRACTION_FAILED",
      request_id: correlationId,
    });
  }
}

app.http("rafidOpportunityExtract", {
  route: "rafid/opportunity/extract",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: opportunityHandler,
});

module.exports = {
  opportunityHandler,
  normalizeOpportunityRequest,
  errorStatus,
};
