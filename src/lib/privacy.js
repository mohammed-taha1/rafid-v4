"use strict";

const crypto = require("node:crypto");

const PRIVACY_CLASSIFICATIONS = [
  "public",
  "internal",
  "confidential",
  "restricted",
];

class RafidRequestError extends Error {
  constructor(message, statusCode = 400, code = "RAFID_BAD_REQUEST") {
    super(message);
    this.name = "RafidRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function requestId() {
  return crypto.randomUUID();
}

function normalizePrivacy(body, { allowLegacy = false } = {}) {
  const privacy = body?.privacy;

  if (!privacy || typeof privacy !== "object") {
    if (allowLegacy) {
      return {
        classification: "public",
        remote_processing_confirmed: true,
        redaction_preview_confirmed: true,
        redactions_applied: [],
        legacy_request: true,
      };
    }
    throw new RafidRequestError(
      "يجب المرور عبر بوابة الخصوصية وتأكيد معاينة البيانات قبل إرسالها.",
      400,
      "RAFID_PRIVACY_CONFIRMATION_REQUIRED",
    );
  }

  const classification = String(privacy.classification || "").toLowerCase();
  if (!PRIVACY_CLASSIFICATIONS.includes(classification)) {
    throw new RafidRequestError(
      "تصنيف الخصوصية غير صالح. القيم المتاحة: public, internal, confidential, restricted.",
      400,
      "RAFID_INVALID_PRIVACY_CLASSIFICATION",
    );
  }

  const allowRestricted =
    String(process.env.RAFID_ALLOW_RESTRICTED_REMOTE_PROCESSING || "false").toLowerCase() ===
    "true";
  if (classification === "restricted" && !allowRestricted) {
    throw new RafidRequestError(
      "المحتوى المقيّد لا يجوز إرساله إلى مزود خارجي. استخدم معالجة داخلية معتمدة أو مراجعة بشرية.",
      422,
      "RAFID_RESTRICTED_REMOTE_PROCESSING_BLOCKED",
    );
  }

  if (privacy.remote_processing_confirmed !== true) {
    throw new RafidRequestError(
      "يلزم تأكيد الموافقة على المعالجة البعيدة لهذا الطلب.",
      400,
      "RAFID_REMOTE_PROCESSING_NOT_CONFIRMED",
    );
  }
  if (privacy.redaction_preview_confirmed !== true) {
    throw new RafidRequestError(
      "يلزم فتح معاينة الإرسال وتأكيدها قبل متابعة الطلب.",
      400,
      "RAFID_REDACTION_PREVIEW_NOT_CONFIRMED",
    );
  }

  return {
    classification,
    remote_processing_confirmed: true,
    redaction_preview_confirmed: true,
    redactions_applied: Array.isArray(privacy.redactions_applied)
      ? privacy.redactions_applied.slice(0, 100).map((value) => String(value).slice(0, 100))
      : [],
    legacy_request: false,
  };
}

function allowLegacyRequests() {
  return String(process.env.RAFID_ALLOW_LEGACY_REQUESTS || "false").toLowerCase() === "true";
}

function inputSize(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value || {}), "utf8");
}

function assertInputSize(value, label = "الطلب") {
  const maxBytes = Math.max(
    50_000,
    Number.parseInt(process.env.RAFID_MAX_REQUEST_BYTES || "1500000", 10),
  );
  if (inputSize(value) > maxBytes) {
    throw new RafidRequestError(
      `${label} يتجاوز الحد المسموح (${Math.round(maxBytes / 1024)} كيلوبايت).`,
      413,
      "RAFID_REQUEST_TOO_LARGE",
    );
  }
}

module.exports = {
  PRIVACY_CLASSIFICATIONS,
  RafidRequestError,
  requestId,
  normalizePrivacy,
  allowLegacyRequests,
  inputSize,
  assertInputSize,
};
