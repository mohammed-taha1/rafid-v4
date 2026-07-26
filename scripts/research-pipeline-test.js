"use strict";

const assert = require("node:assert/strict");
const { analyzeResearch } = require("../src/lib/research-pipeline");
const { createAnalysis, emptyElements } = require("../src/lib/research-schema");

const provider = { analyze: async () => createAnalysis({ elements: emptyElements() }) };

(async () => {
  const ok = await analyzeResearch({ text: "نص بحثي صالح للتحليل والتقييم" }, { provider });
  assert.equal(ok.result.analysisVersion, "rafid.research-readiness.v1");

  const long = await analyzeResearch({ text: "بحث مطول ".repeat(4000) }, { provider, maxAnalysisInputChars: 8000 });
  assert.equal(long.meta.truncated, true);
  assert.equal(long.meta.acceptedChars, 8000);
  assert.ok(long.result.limitations.some((value) => value.includes("الجزء المقبول")));

  await assert.rejects(
    () => analyzeResearch({ text: "a", file: {} }, { provider }),
    (error) => error.code === "INPUT_INVALID",
  );

  const slow = { analyze: () => new Promise((resolve) => setTimeout(() => resolve(createAnalysis({ elements: emptyElements() })), 80)) };
  const one = analyzeResearch({ text: "بحث مكرر صالح للتحليل" }, { provider: slow });
  await assert.rejects(
    () => analyzeResearch({ text: "بحث مكرر صالح للتحليل" }, { provider: slow }),
    (error) => error.code === "ANALYSIS_IN_PROGRESS",
  );
  await one;

  const controller = new AbortController();
  const cancelled = analyzeResearch({ text: "نص إلغاء صالح للتحليل" }, { provider: slow, signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(cancelled, (error) => error.code === "TIMEOUT");
  console.log("Rafid end-to-end analysis pipeline tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
