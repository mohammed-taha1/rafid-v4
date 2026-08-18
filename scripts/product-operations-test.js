"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { gapTaxonomy, normalizedEvent, recordProductEvent, supabaseRequestHeaders } = require("../src/lib/product-telemetry");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const flow = "11111111-1111-4111-8111-111111111111";

const safe = normalizedEvent({
  flow_id: flow,
  event_name: "analysis_finished",
  service_key: "opportunity_match",
  outcome: "succeeded",
  duration_ms: 1250,
  stage_timings: { assessment: 900, malicious_stage: 42 },
  gap_keys: ["budget", "budget", "not_allowed"],
  research_text: "must never survive",
});
assert.deepEqual(safe.stage_timings, { assessment: 900 });
assert.deepEqual(safe.gap_keys, ["budget"]);
assert.equal(Object.hasOwn(safe, "research_text"), false);
assert.throws(() => normalizedEvent({ flow_id: "bad", event_name: "report_viewed", service_key: "general_readiness" }), /flow id/i);
assert.throws(() => normalizedEvent({ flow_id: flow, event_name: "raw_document", service_key: "general_readiness" }), /product event/i);
assert.deepEqual(gapTaxonomy([{ title: "الميزانية غير واضحة" }, { required_action: "وثق الأثر والمؤشرات" }]).sort(), ["budget", "impact"].sort());

const old = { ...process.env };
process.env.RAFID_PRODUCT_TELEMETRY_ENABLED = "true";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_server_test_value";
let captured;
recordProductEvent({ ...safe, flow_id: flow }, { fetchImpl: async (url, options) => { captured = { url, options }; return { ok: true, status: 201 }; } }).then((result) => {
  assert.equal(result.recorded, true);
  const sent = JSON.parse(captured.options.body);
  assert.equal(captured.url, "https://example.supabase.co/rest/v1/rafid_product_events");
  assert.equal(captured.options.headers.apikey, "sb_secret_server_test_value");
  assert.equal(Object.hasOwn(captured.options.headers, "Authorization"), false);
  assert.equal(supabaseRequestHeaders("legacy-service-role-jwt").Authorization, "Bearer legacy-service-role-jwt");
  assert.equal(Object.values(sent).some((value) => String(value).includes("must never survive")), false);
  process.env = old;

  const migration = read("supabase/migrations/20260818150643_product_operations_dashboard.sql");
  for (const forbidden of ["research_text", "raw_text", "file_name", "project_title", "user_email"]) assert.equal(new RegExp(`\\b${forbidden}\\b`, "i").test(migration), false, `${forbidden} must not be a telemetry column`);
  assert.match(migration, /alter table public\.rafid_product_events enable row level security/i);
  assert.match(migration, /revoke all on public\.rafid_product_events from authenticated/i);
  assert.match(migration, /rafid_product_operations_dashboard/);
  assert.match(migration, /rafid_platform_admin_invites/);
  const writerGrant = read("supabase/migrations/20260818163839_grant_product_telemetry_writer.sql");
  const validatorGrant = read("supabase/migrations/20260818164116_grant_product_telemetry_validator.sql");
  assert.match(writerGrant, /grant insert on table public\.rafid_product_events to service_role/i);
  assert.match(writerGrant, /grant usage, select on sequence public\.rafid_product_events_id_seq to service_role/i);
  assert.match(validatorGrant, /grant usage on schema private to service_role/i);
  assert.match(validatorGrant, /grant execute on function private\.rafid_valid_stage_timings\(jsonb\) to service_role/i);

  const frontend = read("frontend/product-operations-dashboard.js");
  for (const label of ["تحليلات ناجحة", "نسبة الإلغاء", "زمن مراحل التحليل", "الخدمات الأكثر استخدامًا", "الفجوات الشائعة", "الزملاء والصلاحيات"]) assert.ok(frontend.includes(label), `dashboard missing ${label}`);
  const clientTelemetry = read("frontend/product-telemetry.js");
  assert.equal(clientTelemetry.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(clientTelemetry.includes("research_text"), false);
  console.log("Product operations privacy, schema, metrics, and admin checks passed.");
}).catch((error) => { process.env = old; throw error; });
