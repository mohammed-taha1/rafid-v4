"use strict";

const { app } = require("@azure/functions");
const { optionsResponse, jsonResponse, authorize, checkRateLimit } = require("../lib/http");
const { recordProductEvent } = require("../lib/product-telemetry");

const CLIENT_EVENTS = new Set(["service_started", "report_viewed", "report_downloaded", "feedback_submitted"]);

async function telemetryHandler(request) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const auth = await authorize(request);
  if (!auth.ok) return jsonResponse(request, auth.statusCode || 401, { ok: false, error: auth.error, code: auth.code });
  const rate = checkRateLimit(request, auth, { countGlobal: false });
  if (!rate.ok) return jsonResponse(request, 429, { ok: false, error: "تم تجاوز حد الأحداث المؤقت.", code: "RAFID_USER_RATE_LIMIT" });
  try {
    const body = await request.json();
    if (!CLIENT_EVENTS.has(String(body?.event_name || ""))) return jsonResponse(request, 400, { ok: false, error: "نوع الحدث غير مدعوم." });
    const result = await recordProductEvent(body);
    return jsonResponse(request, 202, { ok: true, recorded: result.recorded });
  } catch (error) {
    return jsonResponse(request, Number(error?.statusCode || 400), { ok: false, error: "لم يُقبل حدث القياس.", code: error?.code || "RAFID_INVALID_PRODUCT_EVENT" });
  }
}

app.http("rafidProductTelemetry", { route: "rafid/telemetry", methods: ["POST","OPTIONS"], authLevel: "anonymous", handler: telemetryHandler });

module.exports = { CLIENT_EVENTS, telemetryHandler };
