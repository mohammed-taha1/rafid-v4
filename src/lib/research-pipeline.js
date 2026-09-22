"use strict";

const crypto = require("node:crypto");
const { ingestText, ingestFile, IngestError } = require("./ingest");
const { chunkDocument } = require("./long-document");
const { createAnalysis, emptyElements, scoreAnalysis, validateAnalysis } = require("./research-schema");

const active = new Map();
const LONG_DOCUMENT_LIMITATION = "تجاوز المستند الحد الأقصى للتحليل الكامل؛ لذلك حُجبت الدرجة الدقيقة وأُظهر نطاق استرشادي فقط.";

function guardEvidenceAndCoverage(result, { truncated = false, sourceMetadata = [] } = {}) {
  const guarded = structuredClone(result);
  const pageEvidenceRequired = sourceMetadata.some((source) => source?.sourceType === "pdf" && Number(source?.sections) > 0);
  if (pageEvidenceRequired) {
    for (const element of Object.values(guarded.extractedElements || {})) {
      if (element.status === "غير موضح") continue;
      const located = (element.evidence || []).some((entry) => /(?:\[PAGE\s+\d+\]|صفحة\s*\d+|page\s*\d+)/iu.test(String(entry)));
      if (!located) {
        if (element.status === "موجود") element.status = "جزئي";
        element.assessmentNote = `${element.assessmentNote} لم يُربط الدليل برقم صفحة؛ يلزم التحقق من المصدر.`.trim();
      }
    }
    const scores = scoreAnalysis(guarded.extractedElements);
    guarded.technicalReadiness = scores.technical;
    guarded.fundingReadiness = scores.funding;
  }
  if (truncated) {
    for (const key of ["technicalReadiness", "fundingReadiness"]) {
      const readiness = guarded[key];
      const lowerBound = Number.isInteger(readiness.score) ? readiness.score : 0;
      guarded[key] = { ...readiness, score: null, scoreAvailable: false, scoreRange: { minimum: lowerBound, maximum: 100 } };
    }
    guarded.confidence = "منخفض";
  }
  return guarded;
}

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
  maxAnalysisInputChars = 120000,
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
    const safeInputLimit = Math.max(4000, Number(maxAnalysisInputChars) || 120000);
    const chunks = chunkDocument(input.fullText, { maxChars: 8000, maxTotalChars: safeInputLimit });
    if (controller.signal.aborted) throw apiError("TIMEOUT", "انتهت مهلة التحليل أو أُلغي الطلب.", 504);

    const providerResponse = provider.analyze
      ? await provider.analyze({ requestId, textSize: input.fullText.length, chunks: chunks.chunks, sourceMetadata: Array.isArray(payload.source_metadata) ? payload.source_metadata : [], outputLanguage: payload.output_language === "en" ? "en" : "ar", signal: controller.signal })
      : createAnalysis({ elements: emptyElements() });
    const rawResult = providerResponse?.result || providerResponse;
    const providerMeta = providerResponse?.meta || {};
    const wasTruncated = chunks.truncated || providerMeta.extractionTruncated === true;
    const withLimitations = wasTruncated
      ? { ...rawResult, limitations: [...new Set([...(rawResult.limitations || []), LONG_DOCUMENT_LIMITATION])] }
      : rawResult;
    const result = guardEvidenceAndCoverage(withLimitations, { truncated: wasTruncated, sourceMetadata: Array.isArray(payload.source_metadata) ? payload.source_metadata : [] });

    if (controller.signal.aborted) throw apiError("TIMEOUT", "انتهت مهلة التحليل أو أُلغي الطلب.", 504);
    if (!validateAnalysis(result).valid) throw apiError("INVALID_RESPONSE", "تعذر التحقق من نتيجة التحليل.", 502);
    return {
      requestId,
      result,
      meta: {
        sourceType: input.sourceType,
        wordCount: input.wordCount,
        truncated: wasTruncated,
        acceptedChars: Math.min(input.fullText.length, safeInputLimit),
        sourceDocuments: Array.isArray(payload.source_metadata) ? payload.source_metadata.map((source) => ({ name: String(source?.name || "مستند").slice(0, 120), sourceType: String(source?.sourceType || "unknown").slice(0, 16), sections: Math.max(0, Number(source?.sections) || 0) })) : [],
        extractionBatches: Number(providerMeta.extractionBatches) || chunks.chunks.length,
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

module.exports = { analyzeResearch, apiError, guardEvidenceAndCoverage };
