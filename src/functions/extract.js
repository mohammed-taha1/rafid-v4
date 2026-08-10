"use strict";

const { app } = require("@azure/functions");
const {
  optionsResponse,
  jsonResponse,
  authorize,
  checkRateLimit,
  publicError,
} = require("../lib/http");
const { extractWithAI } = require("../lib/ai");
const {
  normalizeProjectData,
  augmentProjectDataFromText,
  fallbackProjectData,
  validateProjectData,
} = require("../lib/normalize");
const {
  requestId,
  normalizePrivacy,
  allowLegacyRequests,
  assertInputSize,
} = require("../lib/privacy");

function normalizeRequestBody(body) {
  if (!body || typeof body !== "object") {
    throw new Error("جسم الطلب غير صالح.");
  }

  const rawText = String(body.raw_text || "").trim();
  if (rawText.length < 30) {
    throw new Error("النص المستخرج قصير جدًا. يلزم 30 حرفًا على الأقل.");
  }

  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const files = Array.isArray(body.files) ? body.files.slice(0, 30) : [];

  assertInputSize(body, "طلب استخراج المشروع");
  const privacy = normalizePrivacy(body, { allowLegacy: allowLegacyRequests() });

  const outputLanguage = body.output_language === "en" ? "en" : "ar";
  return { rawText, metadata, files, privacy, outputLanguage };
}

async function extractHandler(request, context) {
  if (request.method === "OPTIONS") return optionsResponse(request);

  const auth = await authorize(request);
  if (!auth.ok) return jsonResponse(request, auth.statusCode || 401, { ok: false, error: auth.error, code: auth.code });

  const rate = checkRateLimit(request, auth);
  if (!rate.ok) {
    return jsonResponse(
      request,
      429,
      {
        ok: false,
        error: "تم تجاوز حد الطلبات المؤقت لهذا الاتصال. حاول لاحقًا.",
        retry_after_seconds: Math.max(
          1,
          Math.ceil((rate.resetAt - Date.now()) / 1000),
        ),
      },
      { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) },
    );
  }

  const startedAt = Date.now();
  const correlationId = requestId();

  try {
    const body = await request.json();
    const input = normalizeRequestBody(body);

    context.log(
      `Rafid project extraction started: request_id=${correlationId}, chars=${input.rawText.length}, files=${input.files.length}, classification=${input.privacy.classification}`,
    );

    let ai;
    let projectData;
    let fallbackReason = null;
    try {
      ai = await extractWithAI(input);
      projectData = normalizeProjectData(augmentProjectDataFromText(ai.project, input.rawText), {
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

    context.log(
      `Rafid project extraction completed: request_id=${correlationId}, valid=${validation.valid}, duration_ms=${Date.now() - startedAt}`,
    );

    return jsonResponse(request, validation.valid ? 200 : 422, {
      ok: validation.valid,
      project_data: projectData,
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
    context.error("Rafid project extraction failed", {
      request_id: correlationId,
      name: error?.name,
      status: error?.status,
      code: error?.code || "RAFID_EXTRACTION_FAILED",
    });

    const status = Number(error?.statusCode || error?.status || 0);
    const httpStatus =
      error instanceof SyntaxError
        ? 400
        : [400, 413, 422, 429].includes(status)
        ? status
        : status === 401 || status === 403
        ? 502
          : /قصير جدًا|غير صالح|يلزم|جسم الطلب/.test(String(error?.message || ""))
            ? 400
            : 500;

    return jsonResponse(request, httpStatus, {
      ok: false,
      error: publicError(error),
      code: error?.code || "RAFID_EXTRACTION_FAILED",
      request_id: correlationId,
    });
  }
}

app.http("rafidExtract", {
  route: "rafid/extract",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: extractHandler,
});

module.exports = {
  extractHandler,
  normalizeRequestBody,
};
