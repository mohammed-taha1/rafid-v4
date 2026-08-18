"use strict";

const crypto = require("node:crypto");
const { chunkDocument, chunkId } = require("./long-document");
const { extractWithAI, extractOpportunityWithAI, assessWithAI } = require("./ai");
const { normalizeProjectData, augmentProjectDataFromText, fallbackProjectData, validateProjectData } = require("./normalize");
const { normalizeOpportunityData, fallbackOpportunityData, validateOpportunityData } = require("./opportunity-normalize");
const { normalizeAssessmentData, fallbackAssessmentData, validateAssessmentData } = require("./assessment-normalize");

const JOB_VERSION = "rafid.analysis-job.v1";
const jobs = new Map();
const opportunityCache = new Map();
const metrics = { created: 0, completed: 0, failed: 0, timed_out: 0, cancelled: 0, stage_ms: {} };

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function safeClone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function mergeValues(left, right) {
  if (right === null || right === undefined || right === "") return safeClone(left);
  if (left === null || left === undefined || left === "") return safeClone(right);
  if (Array.isArray(left) || Array.isArray(right)) {
    const values = [...(Array.isArray(left) ? left : [left]), ...(Array.isArray(right) ? right : [right])];
    const seen = new Set();
    return values.filter((entry) => {
      const key = JSON.stringify(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (typeof left === "object" && typeof right === "object") {
    const output = { ...safeClone(left) };
    for (const [key, value] of Object.entries(right)) output[key] = mergeValues(output[key], value);
    return output;
  }
  if (typeof left === "boolean" || typeof right === "boolean") return Boolean(left || right);
  if (typeof left === "number" && typeof right === "number") return Math.max(left, right);
  return String(right).length > String(left).length ? right : left;
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function normalizeJobInput(body) {
  const opportunityRequest = body?.opportunity_request;
  const projectRequest = body?.project_request;
  const opportunityText = String(opportunityRequest?.source_text || "").trim();
  const projectText = String(projectRequest?.raw_text || "").trim();
  if (opportunityText.length < 100) throw Object.assign(new Error("نص الفرصة قصير جدًا."), { statusCode: 400 });
  if (projectText.length < 30) throw Object.assign(new Error("نص البحث قصير جدًا."), { statusCode: 400 });
  const opportunityFields = { ...opportunityRequest };
  const projectFields = { ...projectRequest };
  delete opportunityFields.source_text;
  delete projectFields.raw_text;
  return {
    opportunityRequest: { ...opportunityFields, sourceText: opportunityText },
    projectRequest: { ...projectFields, rawText: projectText },
    previousAssessment: body.previous_assessment || null,
    outputLanguage: body.output_language === "en" ? "en" : "ar",
  };
}

function publicJob(job) {
  return {
    job_version: JOB_VERSION,
    job_id: job.id,
    status: job.status,
    stage: job.stage,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    expires_at: job.expiresAt,
    progress: job.progress,
    timings_ms: { ...job.timings },
    chunk_metrics: { ...job.chunkMetrics },
    result: safeClone(job.result),
    error: job.error ? { code: job.error.code, message: job.error.message } : null,
    privacy: { raw_research_persisted: false, opportunity_cache_contains_raw_text: false },
  };
}

function authorizeJob(id, token) {
  const job = jobs.get(String(id || ""));
  if (!job || !token || !crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(job.tokenHash))) {
    throw Object.assign(new Error("المهمة غير موجودة أو رمز الاستعادة غير صالح."), { statusCode: 404, code: "RAFID_JOB_NOT_FOUND" });
  }
  return job;
}

function updateStage(job, stage, progress) {
  job.stage = stage;
  job.progress = progress;
  job.updatedAt = new Date().toISOString();
}

async function timed(job, stage, worker) {
  const started = Date.now();
  try { return await worker(); }
  finally {
    const duration = Date.now() - started;
    job.timings[stage] = duration;
    const current = metrics.stage_ms[stage] || { count: 0, total: 0, max: 0 };
    metrics.stage_ms[stage] = { count: current.count + 1, total: current.total + duration, max: Math.max(current.max, duration) };
  }
}

async function extractOpportunity(job, input) {
  const key = hash(JSON.stringify({ text: input.sourceText, metadata: input.metadata, language: input.outputLanguage }));
  const cached = opportunityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { opportunity: safeClone(cached.opportunity), cacheHit: true };
  let data;
  try { data = (await extractOpportunityWithAI(input)).opportunity; }
  catch (error) {
    if (error?.code !== "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED") throw error;
    data = fallbackOpportunityData(input.sourceText, { metadata: input.metadata });
  }
  const opportunity = normalizeOpportunityData(data, { metadata: input.metadata });
  const validation = validateOpportunityData(opportunity);
  if (!validation.valid) throw Object.assign(new Error("لم تجتز الفرصة التحقق البنيوي."), { statusCode: 422, code: "RAFID_INVALID_OPPORTUNITY" });
  opportunityCache.set(key, { opportunity: safeClone(opportunity), expiresAt: Date.now() + positiveInteger(process.env.RAFID_OPPORTUNITY_CACHE_MINUTES, 1440, 10080) * 60_000 });
  return { opportunity, cacheHit: false };
}

async function extractProject(job, input) {
  const chunked = chunkDocument(input.rawText, {
    maxChars: positiveInteger(process.env.RAFID_JOB_CHUNK_CHARS, 4800, 12000),
    overlap: positiveInteger(process.env.RAFID_JOB_CHUNK_OVERLAP, 320, 1200),
    maxTotalChars: positiveInteger(process.env.RAFID_JOB_MAX_TEXT_CHARS, 120000, 300000),
  });
  const unique = [];
  const seen = new Set();
  for (const text of chunked.chunks) {
    const id = chunkId(text);
    if (!seen.has(id)) { seen.add(id); unique.push({ id, text }); }
  }
  const concurrency = positiveInteger(process.env.RAFID_JOB_CONCURRENCY, 2, 4);
  const outputs = await mapConcurrent(unique, concurrency, async (chunk) => {
    if (job.cancelled) throw Object.assign(new Error("أُلغي التحليل."), { code: "RAFID_JOB_CANCELLED" });
    try { return (await extractWithAI({ ...input, rawText: chunk.text })).project; }
    catch (error) {
      if (error?.code !== "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED") throw error;
      return fallbackProjectData(chunk.text, { metadata: input.metadata, files: input.files });
    }
  });
  const merged = outputs.reduce(mergeValues, {});
  const project = normalizeProjectData(augmentProjectDataFromText(merged, input.rawText), { metadata: input.metadata, files: input.files });
  const validation = validateProjectData(project);
  if (!validation.valid) throw Object.assign(new Error("لم يجتز البحث التحقق البنيوي."), { statusCode: 422, code: "RAFID_INVALID_PROJECT" });
  job.chunkMetrics = { total: chunked.chunks.length, unique: unique.length, duplicates_removed: chunked.chunks.length - unique.length, parallelism: concurrency, truncated: chunked.truncated, estimated_tokens: chunked.estimatedTokens };
  return project;
}

async function executeJob(job, input) {
  const timeoutMs = positiveInteger(process.env.ANALYSIS_TIMEOUT_SECONDS, 120, 600) * 1000;
  job.status = "running";
  const timeout = setTimeout(() => {
    job.timedOut = true;
    job.status = "timed_out";
    job.error = { code: "RAFID_JOB_TIMEOUT", message: "استغرق التحليل وقتًا أطول من الحد. حاول مجددًا." };
    updateStage(job, "timed_out", job.progress);
    metrics.timed_out += 1;
  }, timeoutMs);
  try {
    updateStage(job, "extracting", 15);
    const [opportunityResult, project] = await Promise.all([
      timed(job, "opportunity_extraction", () => extractOpportunity(job, { ...input.opportunityRequest, outputLanguage: input.outputLanguage })),
      timed(job, "research_extraction", () => extractProject(job, { ...input.projectRequest, outputLanguage: input.outputLanguage })),
    ]);
    if (job.cancelled) throw Object.assign(new Error("أُلغي التحليل."), { code: "RAFID_JOB_CANCELLED" });
    if (job.timedOut) throw Object.assign(new Error("تجاوز التحليل المهلة الإجمالية."), { code: "RAFID_JOB_TIMEOUT" });
    updateStage(job, "assessing", 72);
    const assessmentInput = {
      opportunity: opportunityResult.opportunity,
      project,
      previousAssessment: input.previousAssessment,
      context: { assessment_date: new Date().toISOString().slice(0, 10), reviewer_role: "الباحث أو المراجع" },
      privacy: input.projectRequest.privacy,
      outputLanguage: input.outputLanguage,
    };
    let assessmentData;
    try { assessmentData = (await timed(job, "assessment", () => assessWithAI(assessmentInput))).assessment; }
    catch (error) {
      if (error?.code !== "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED") throw error;
      assessmentData = fallbackAssessmentData(assessmentInput);
    }
    if (job.timedOut) throw Object.assign(new Error("تجاوز التحليل المهلة الإجمالية."), { code: "RAFID_JOB_TIMEOUT" });
    const assessment = normalizeAssessmentData(assessmentData, assessmentInput);
    const validation = validateAssessmentData(assessment);
    if (!validation.valid) throw Object.assign(new Error("لم تجتز النتيجة التحقق البنيوي."), { statusCode: 422, code: "RAFID_INVALID_ASSESSMENT" });
    updateStage(job, "reporting", 94);
    job.result = { opportunity: opportunityResult.opportunity, project_data: project, assessment, meta: { opportunity_cache_hit: opportunityResult.cacheHit, completed_at: new Date().toISOString() } };
    job.status = "completed";
    updateStage(job, "completed", 100);
    metrics.completed += 1;
  } catch (error) {
    if (job.cancelled || error?.code === "RAFID_JOB_CANCELLED") { job.status = "cancelled"; metrics.cancelled += 1; }
    else if (job.timedOut || error?.code === "RAFID_JOB_TIMEOUT") { job.status = "timed_out"; if (job.error?.code !== "RAFID_JOB_TIMEOUT") metrics.timed_out += 1; }
    else { job.status = "failed"; metrics.failed += 1; }
    job.error = { code: error?.code || "RAFID_JOB_FAILED", message: job.status === "timed_out" ? "استغرق التحليل وقتًا أطول من الحد. حاول مجددًا." : String(error?.message || "تعذر إكمال التحليل.").slice(0, 300) };
    updateStage(job, job.status, job.progress);
  } finally {
    clearTimeout(timeout);
    input.opportunityRequest.sourceText = "";
    input.projectRequest.rawText = "";
  }
}

function createAnalysisJob(body) {
  const input = normalizeJobInput(body);
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const ttlMs = positiveInteger(process.env.RAFID_JOB_RESULT_TTL_MINUTES, 20, 120) * 60_000;
  const job = { id, tokenHash: hash(token), status: "queued", stage: "queued", progress: 0, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString(), timings: {}, chunkMetrics: {}, result: null, error: null, cancelled: false, timedOut: false };
  jobs.set(id, job);
  metrics.created += 1;
  setImmediate(() => executeJob(job, input));
  return { job: publicJob(job), resume_token: token };
}

function getAnalysisJob(id, token) { return publicJob(authorizeJob(id, token)); }
function cancelAnalysisJob(id, token) { const job = authorizeJob(id, token); if (["queued", "running"].includes(job.status) || ["queued", "extracting", "assessing", "reporting"].includes(job.stage)) { job.cancelled = true; updateStage(job, "cancelling", job.progress); } return publicJob(job); }
function jobMetrics() { return safeClone(metrics); }
function clearExpiredJobs(now = Date.now()) { for (const [id, job] of jobs) if (Date.parse(job.expiresAt) <= now) jobs.delete(id); for (const [key, entry] of opportunityCache) if (entry.expiresAt <= now) opportunityCache.delete(key); }

const cleanupTimer = setInterval(clearExpiredJobs, 60_000);
cleanupTimer.unref?.();

module.exports = { JOB_VERSION, createAnalysisJob, getAnalysisJob, cancelAnalysisJob, clearExpiredJobs, jobMetrics, mergeValues, mapConcurrent, normalizeJobInput };
