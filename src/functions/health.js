"use strict";

const { app } = require("@azure/functions");
const { optionsResponse, jsonResponse, authorize } = require("../lib/http");
const { currentProviderStatus } = require("../lib/ai");
const { publicRuntimeConfig } = require("../lib/auth");
const { jobMetrics } = require("../lib/analysis-jobs");

async function healthHandler(request) {
  if (request.method === "OPTIONS") return optionsResponse(request);

  const auth = await authorize(request);
  if (!auth.ok) return jsonResponse(request, auth.statusCode || 401, { ok: false, error: auth.error, code: auth.code });

  const provider = currentProviderStatus();
  const runtime = publicRuntimeConfig();
  const ready = provider.ready && runtime.auth.ready;
  return jsonResponse(request, ready ? 200 : 503, {
    ok: ready,
    ready,
    service: "Rafid V4.3 Shared Opportunity Readiness Backend",
    version: "4.3.0",
    time: new Date().toISOString(),
    provider,
    auth: {
      required: runtime.auth.required,
      provider: runtime.auth.provider,
      authenticated: Boolean(auth.user?.id),
      user_id: auth.user?.id || null,
    },
    deployment_mode: runtime.deployment_mode,
    workspace_sync: runtime.workspace_sync.enabled,
    privacy_gateway: true,
    raw_content_persistence: false,
    analysis_jobs: jobMetrics(),
    endpoints: [
      "/api/rafid/health",
      "/api/rafid/public/config",
      "/api/rafid/source/fetch",
      "/api/rafid/extract",
      "/api/rafid/opportunity/extract",
      "/api/rafid/opportunity/assess",
      "/api/rafid/analysis/jobs",
      "/api/rafid/telemetry",
      "/api/rafid/opportunities/catalog",
    ],
  });
}

app.http("rafidHealth", {
  route: "rafid/health",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: healthHandler,
});

module.exports = { healthHandler };
