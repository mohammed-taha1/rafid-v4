"use strict";

const assert = require("node:assert/strict");
const ai = require("../src/lib/ai");

function schemaFailure() {
  const error = new Error("fixture structured output failure");
  error.code = "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED";
  return Promise.reject(error);
}

ai.extractWithAI = schemaFailure;
ai.extractOpportunityWithAI = schemaFailure;
ai.assessWithAI = schemaFailure;

const { createAnalysisJob, getAnalysisJob, mapConcurrent, mergeValues } = require("../src/lib/analysis-jobs");

assert.deepEqual(mergeValues({ a: "قصير", rows: [1] }, { a: "نص أطول", rows: [1, 2] }), { a: "نص أطول", rows: [1, 2] });

(async () => {
  let active = 0;
  let peak = 0;
  const mapped = await mapConcurrent([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(mapped, [2, 4, 6, 8]);
  assert.equal(peak, 2);

  const privacy = { classification: "internal", remote_processing_confirmed: true, redaction_preview_confirmed: true, redactions_applied: [] };
  const body = {
    opportunity_request: {
      source_text: "دعوة رسمية لتمويل الأبحاث التطبيقية. يشترط تقديم خطة تنفيذ وميزانية واضحة وإثبات أهلية الجهة المتقدمة. ".repeat(3),
      metadata: { title: "فرصة اختبار", funder: "جهة اختبار", official_source_url: "https://example.test/call", source_name: "fixture" },
      privacy,
    },
    project_request: {
      raw_text: "يعالج المشروع مشكلة تسرب المياه باستخدام حساسات ونموذج تحليلي. أُجري اختبار أولي وتوجد خطة تنفيذ وميزانية ومؤشرات أثر. ".repeat(8),
      metadata: { title: "بحث اختبار", type: "بحث تطبيقي" },
      files: [],
      privacy,
    },
  };
  const created = createAnalysisJob(body);
  assert.ok(created.resume_token.length >= 40);
  let job;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    job = getAnalysisJob(created.job.job_id, created.resume_token);
    if (["completed", "failed", "timed_out", "cancelled"].includes(job.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(job.status, "completed", job.error?.message);
  assert.equal(job.progress, 100);
  assert.equal(job.privacy.raw_research_persisted, false);
  assert.ok(job.chunk_metrics.unique >= 1);
  assert.ok(job.timings_ms.assessment >= 0);
  assert.ok(job.result.assessment);
  assert.throws(() => getAnalysisJob(created.job.job_id, "wrong-token"), /غير موجودة|غير صالح/);

  const repeated = createAnalysisJob(body);
  let repeatedJob;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    repeatedJob = getAnalysisJob(repeated.job.job_id, repeated.resume_token);
    if (["completed", "failed", "timed_out", "cancelled"].includes(repeatedJob.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(repeatedJob.status, "completed", repeatedJob.error?.message);
  assert.equal(repeatedJob.result.meta.opportunity_cache_hit, true);
  console.log("Rafid resumable analysis job tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
