"use strict";

const { app } = require("@azure/functions");
const {
  optionsResponse,
  jsonResponse,
  authorize,
  checkRateLimit,
  publicError,
} = require("../lib/http");
const { assessWithAI } = require("../lib/ai");
const {
  fallbackAssessmentData,
  normalizeAssessmentData,
  validateAssessmentData,
} = require("../lib/assessment-normalize");
const {
  validateOpportunityData,
  normalizeOpportunityData,
} = require("../lib/opportunity-normalize");
const { validateProjectData, normalizeProjectData } = require("../lib/normalize");
const {
  requestId,
  normalizePrivacy,
  assertInputSize,
} = require("../lib/privacy");
const { errorStatus } = require("./opportunity");

function normalizeAssessmentRequest(body) {
  if (!body || typeof body !== "object") throw new Error("جسم الطلب غير صالح.");
  assertInputSize(body, "طلب مطابقة المشروع");
  if (!body.opportunity || typeof body.opportunity !== "object")
    throw new Error("بيانات فرصة التمويل مطلوبة.");
  if (!body.project_data || typeof body.project_data !== "object")
    throw new Error("بيانات المشروع المنظمة مطلوبة.");

  const opportunity = normalizeOpportunityData(body.opportunity);
  const opportunityValidation = validateOpportunityData(opportunity);
  if (!opportunityValidation.valid) {
    const error = new Error(`فرصة التمويل غير صالحة: ${opportunityValidation.errors.join(" ")}`);
    error.statusCode = 422;
    error.code = "RAFID_INVALID_OPPORTUNITY";
    throw error;
  }

  const project = normalizeProjectData(body.project_data);
  const projectValidation = validateProjectData(project);
  if (!projectValidation.valid) {
    const error = new Error(`بيانات المشروع غير صالحة: ${projectValidation.errors.join(" ")}`);
    error.statusCode = 422;
    error.code = "RAFID_INVALID_PROJECT";
    throw error;
  }

  const context = body.context && typeof body.context === "object" ? body.context : {};
  const privacy = normalizePrivacy(body);
  const outputLanguage = body.output_language === "en" ? "en" : "ar";
  return { opportunity, project, context, privacy, outputLanguage };
}

async function assessHandler(request, context) {
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
    const input = normalizeAssessmentRequest(body);
    context.log(
      `Rafid assessment started: request_id=${correlationId}, requirements=${input.opportunity.requirements.length}, classification=${input.privacy.classification}`,
    );

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
        responseId: null,
        inputTruncated: false,
        usage: null,
        dataPolicy: "no_additional_storage",
      };
    }
    const assessment = normalizeAssessmentData(assessmentData, input);
    const validation = validateAssessmentData(assessment);

    context.log(
      `Rafid assessment completed: request_id=${correlationId}, valid=${validation.valid}, eligibility=${assessment.eligibility.status}, duration_ms=${Date.now() - startedAt}`,
    );
    return jsonResponse(request, validation.valid ? 200 : 422, {
      ok: validation.valid,
      assessment,
      validation,
      assessment_meta: {
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
    context.error("Rafid assessment failed", {
      request_id: correlationId,
      name: error?.name,
      code: error?.code || "RAFID_ASSESSMENT_FAILED",
    });
    return jsonResponse(request, errorStatus(error), {
      ok: false,
      error: publicError(error),
      code: error?.code || "RAFID_ASSESSMENT_FAILED",
      request_id: correlationId,
    });
  }
}

app.http("rafidOpportunityAssess", {
  route: "rafid/opportunity/assess",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: assessHandler,
});

module.exports = {
  assessHandler,
  normalizeAssessmentRequest,
};
