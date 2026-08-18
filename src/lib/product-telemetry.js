"use strict";

const { envFlag, supabaseEnvironment } = require("./env");

const EVENT_NAMES = new Set(["service_started", "analysis_finished", "report_viewed", "report_downloaded", "feedback_submitted"]);
const SERVICE_KEYS = new Set(["general_readiness", "opportunity_match", "funding_discovery", "portfolio_compare", "institution_workspace", "improve_research"]);
const OUTCOMES = new Set(["succeeded", "failed", "timed_out", "cancelled"]);
const STAGES = new Set(["opportunity_extraction", "research_extraction", "assessment", "total"]);
const GAP_RULES = [
  ["budget", /ميزان|تكلف|budget|cost/i], ["impact", /أثر|impact/i], ["methodology", /منهج|method/i],
  ["evidence", /دليل|إثبات|نتائج|evidence|validation/i], ["team", /فريق|خبر|team/i], ["risk", /مخاطر|risk/i],
  ["timeline", /زمن|جدول|مدة|timeline|schedule/i], ["eligibility", /أهلي|شرط|eligib/i],
  ["intellectual_property", /ملكية|براءة|ترخيص|intellectual|patent|license/i], ["partnerships", /شريك|partner/i],
  ["market", /سوق|مستفيد|market|beneficiar/i], ["measurement", /مؤشر|قياس|baseline|metric/i],
];

function clampInteger(value, minimum, maximum) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : null;
}

function gapTaxonomy(gaps) {
  const keys = new Set();
  for (const gap of Array.isArray(gaps) ? gaps : []) {
    const source = [gap?.title, gap?.required_action, gap?.missing_evidence].flat().filter(Boolean).join(" ");
    keys.add(GAP_RULES.find(([, pattern]) => pattern.test(source))?.[0] || "other");
  }
  return [...keys].slice(0, 12);
}

function normalizedEvent(input = {}) {
  const eventName = String(input.event_name || "");
  const serviceKey = String(input.service_key || "");
  if (!EVENT_NAMES.has(eventName)) throw Object.assign(new Error("Invalid product event."), { statusCode: 400, code: "RAFID_INVALID_PRODUCT_EVENT" });
  if (!SERVICE_KEYS.has(serviceKey)) throw Object.assign(new Error("Invalid service key."), { statusCode: 400, code: "RAFID_INVALID_SERVICE_KEY" });
  const flowId = String(input.flow_id || "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(flowId)) throw Object.assign(new Error("Invalid flow id."), { statusCode: 400, code: "RAFID_INVALID_FLOW_ID" });
  const outcome = input.outcome == null ? null : String(input.outcome);
  if (outcome && !OUTCOMES.has(outcome)) throw Object.assign(new Error("Invalid outcome."), { statusCode: 400, code: "RAFID_INVALID_PRODUCT_EVENT" });
  const stageTimings = {};
  for (const [stage, value] of Object.entries(input.stage_timings || {})) {
    const duration = clampInteger(value, 0, 3_600_000);
    if (STAGES.has(stage) && duration !== null) stageTimings[stage] = duration;
  }
  const errorCode = String(input.error_code || "").toUpperCase();
  return {
    flow_id: flowId,
    event_name: eventName,
    service_key: serviceKey,
    outcome,
    duration_ms: input.duration_ms == null ? null : clampInteger(input.duration_ms, 0, 3_600_000),
    stage_timings: stageTimings,
    error_code: /^[A-Z0-9_]{2,80}$/.test(errorCode) ? errorCode : null,
    rating: input.rating == null ? null : clampInteger(input.rating, 1, 3),
    gap_keys: Array.isArray(input.gap_keys) ? [...new Set(input.gap_keys)].filter((key) => GAP_RULES.some(([allowed]) => allowed === key) || key === "other").slice(0, 12) : [],
  };
}

function telemetryReady() {
  return envFlag("RAFID_PRODUCT_TELEMETRY_ENABLED", true)
    && supabaseEnvironment().validUrl
    && Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim());
}

function supabaseRequestHeaders(key) {
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  // Supabase's modern sb_secret_* keys are opaque API keys, not JWTs. Legacy
  // service_role JWTs still need the Authorization header for PostgREST.
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function recordProductEvent(input, { fetchImpl = fetch } = {}) {
  const event = normalizedEvent(input);
  if (!telemetryReady()) return { recorded: false, reason: "not_configured" };
  const environment = supabaseEnvironment();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  try {
    const response = await fetchImpl(`${environment.url}/rest/v1/rafid_product_events`, {
      method: "POST",
      headers: supabaseRequestHeaders(key),
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? { recorded: true } : { recorded: false, reason: `http_${response.status}` };
  } catch {
    return { recorded: false, reason: "unavailable" };
  }
}

module.exports = { EVENT_NAMES, SERVICE_KEYS, gapTaxonomy, normalizedEvent, recordProductEvent, supabaseRequestHeaders, telemetryReady };
