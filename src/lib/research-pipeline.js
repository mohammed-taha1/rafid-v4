"use strict";

const crypto = require("node:crypto");
const { ingestText, ingestFile, IngestError } = require("./ingest");
const { chunkDocument } = require("./long-document");
const { createAnalysis, emptyElements, validateAnalysis } = require("./research-schema");

const active = new Map();
const LONG_DOCUMENT_LIMITATION = "تم تحليل الجزء المقبول من المستند الطويل فقط؛ راجع الأقسام المتبقية أو أعد التحليل على ملخص مركز.";

function apiError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = status;
  return error;
}

function safeError(error) {
  if (error instanceof IngestError) return apiError(error.code, error.message, 422);
  if (error?.kind) return apiError(error.kind, error.message, 502);
  return apiError("PROVIDER_UNAVAILABLE", "تعذر إكمال التحليل الآن. حاول مرة أخرى.", 503);
}

async function analyzeResearch(payload, {
  provider,
  maxFileSizeMb = 20,
  maxAnalysisInputChars = 16000,
  timeoutMs = 65000,
  signal,
} = {}) {
  const requestId = crypto.randomUUID();
  if (!provider) throw apiError("CONFIGURATION_ERROR", "خدمة التحليل غير جاهزة.", 503);

  const hasText = Boolean(payload?.text?.trim());
  const hasFile = Boolean(payload?.file);
  if (hasText === hasFile) throw apiError("INPUT_INVALID", "أدخل نصًا أو ملفًا واحدًا فقط.", 422);

  let input;
  try {
    input = hasText
      ? ingestText(payload.text)
      : await ingestFile({
        name: payload.file.name,
        mimeType: payload.file.mimeType,
        data: Buffer.from(payload.file.dataBase64 || "", "base64"),
      }, { maxFileSizeMb });
  } catch (error) {
    throw safeError(error);
  }

  const key = crypto.createHash("sha256").update(input.fullText).digest("hex");
  if (active.has(key)) throw apiError("ANALYSIS_IN_PROGRESS", "التحليل نفسه قيد التنفيذ بالفعل.", 409);
  active.set(key, requestId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const safeInputLimit = Math.max(4000, Number(maxAnalysisInputChars) || 16000);
    const chunks = chunkDocument(input.fullText, { maxChars: 8000, maxTotalChars: safeInputLimit });
    if (controller.signal.aborted) throw apiError("TIMEOUT", "انتهت مهلة التحليل أو أُلغي الطلب.", 504);

    const rawResult = provider.analyze
      ? await provider.analyze({ requestId, textSize: input.fullText.length, chunks: chunks.chunks, outputLanguage: payload.output_language === "en" ? "en" : "ar", signal: controller.signal })
      : createAnalysis({ elements: emptyElements() });
    const result = chunks.truncated
      ? { ...rawResult, limitations: [...new Set([...(rawResult.limitations || []), LONG_DOCUMENT_LIMITATION])] }
      : rawResult;

    if (controller.signal.aborted) throw apiError("TIMEOUT", "انتهت مهلة التحليل أو أُلغي الطلب.", 504);
    if (!validateAnalysis(result).valid) throw apiError("INVALID_RESPONSE", "تعذر التحقق من نتيجة التحليل.", 502);
    return {
      requestId,
      result,
      meta: {
        sourceType: input.sourceType,
        wordCount: input.wordCount,
        truncated: chunks.truncated,
        acceptedChars: Math.min(input.fullText.length, safeInputLimit),
      },
    };
  } catch (error) {
    if (error.code) throw error;
    throw safeError(error);
  } finally {
    clearTimeout(timer);
    active.delete(key);
  }
}

module.exports = { analyzeResearch, apiError };
