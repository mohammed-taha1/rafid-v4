"use strict";

const assert = require("node:assert/strict");
const model = require("../frontend/improvement-model");

const first = {
  eligibility: { status: "غير محسوم" },
  readiness: { score_available: true, opportunity_readiness_score: 42, evidence_strength_score: 31 },
  gaps: [{ priority: "حرجة", title: "ميزانية غير مبررة", why_it_matters: "تمنع القرار", missing_evidence: ["عرض سعر"] }],
  action_plan: [{ priority: "عالية", action: "بناء خطة مخاطر", why_now: "لإثبات قابلية التنفيذ", output: "سجل مخاطر" }],
};
const second = {
  eligibility: { status: "مؤهل بشروط" },
  readiness: { score_available: true, opportunity_readiness_score: 68, evidence_strength_score: 57 },
  gaps: [], action_plan: [],
};
const tasks = model.makeTasks(first, "ar");
assert.equal(tasks.length, 2);
assert.match(tasks[0].question, /الدليل/);
assert.match(tasks[1].question, /سجل مخاطر/);
assert.equal(model.makeTasks(first, "en")[0].question.startsWith("What evidence"), true);
const before = model.buildRound(first, "2026-08-18T00:00:00.000Z");
const after = model.buildRound(second, "2026-08-19T00:00:00.000Z");
assert.deepEqual(model.compareRounds(before, after), { score_change: 26, evidence_change: 26, closed_critical_gaps: 1, eligibility_changed: true });
assert.equal(model.score({ readiness: { score_available: false, opportunity_readiness_score: 0 } }), null);

console.log("Rafid improvement workspace model tests passed.");
