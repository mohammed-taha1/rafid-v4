"use strict";

const { app } = require("@azure/functions");
const { optionsResponse, jsonResponse, authorize, checkRateLimit, publicError } = require("../lib/http");
const { createAnalysisJob, getAnalysisJob, cancelAnalysisJob } = require("../lib/analysis-jobs");

function tokenFrom(request) {
  return String(request.headers.get("x-rafid-job-token") || "").trim();
}

async function analysisJobsHandler(request, context) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const auth = await authorize(request);
  if (!auth.ok) return jsonResponse(request, auth.statusCode || 401, { ok: false, error: auth.error, code: auth.code });
  try {
    const id = String(request.params?.id || "").trim();
    if (request.method === "POST" && !id) {
      const rate = checkRateLimit(request, auth);
      if (!rate.ok) return jsonResponse(request, 429, { ok: false, error: "تم تجاوز حد الطلبات المؤقت.", code: "RAFID_USER_RATE_LIMIT" });
      const created = createAnalysisJob(await request.json());
      context.log(`Rafid analysis job created: job_id=${created.job.job_id}`);
      return jsonResponse(request, 202, { ok: true, ...created }, { Location: `/api/rafid/analysis/jobs/${created.job.job_id}`, "Cache-Control": "no-store" });
    }
    if (!id) return jsonResponse(request, 400, { ok: false, error: "معرف المهمة مطلوب.", code: "RAFID_JOB_ID_REQUIRED" });
    if (request.method === "GET") return jsonResponse(request, 200, { ok: true, job: getAnalysisJob(id, tokenFrom(request)) }, { "Cache-Control": "no-store" });
    if (request.method === "DELETE") return jsonResponse(request, 202, { ok: true, job: cancelAnalysisJob(id, tokenFrom(request)) }, { "Cache-Control": "no-store" });
    return jsonResponse(request, 405, { ok: false, error: "الطريقة غير مدعومة." });
  } catch (error) {
    context.error("Rafid analysis job request failed", { code: error?.code || "RAFID_JOB_FAILED" });
    return jsonResponse(request, Number(error?.statusCode || 500), { ok: false, error: publicError(error), code: error?.code || "RAFID_JOB_FAILED" });
  }
}

app.http("rafidAnalysisJobs", {
  route: "rafid/analysis/jobs/{id?}",
  methods: ["POST", "GET", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  handler: analysisJobsHandler,
});

module.exports = { analysisJobsHandler, tokenFrom };
