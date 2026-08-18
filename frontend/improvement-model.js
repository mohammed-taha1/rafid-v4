"use strict";

/* global module */

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RafidImprovementModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const list = (value) => Array.isArray(value) ? value : [];
  const score = (assessment) => assessment?.readiness?.score_available ? Number(assessment.readiness.opportunity_readiness_score) : null;

  function makeTasks(assessment, language = "ar") {
    const english = language === "en";
    const tasks = [];
    list(assessment?.gaps).forEach((gap, index) => tasks.push({
      id: `gap-${index}`,
      type: "gap",
      priority: gap.priority || (english ? "Important" : "مهمة"),
      title: gap.title || gap.required_action || (english ? "Gap to address" : "فجوة تحتاج معالجة"),
      why: gap.why_it_matters || gap.required_action || "",
      question: gap.missing_evidence?.length
        ? (english ? `What evidence can you add to close: ${gap.title || "this gap"}?` : `ما الدليل الذي يمكنك إضافته لإغلاق: ${gap.title || "هذه الفجوة"}؟`)
        : (english ? `What missing information would resolve: ${gap.title || "this gap"}?` : `ما المعلومة الناقصة التي تحسم: ${gap.title || "هذه الفجوة"}؟`),
      completed: false,
    }));
    list(assessment?.action_plan).forEach((action, index) => tasks.push({
      id: `action-${index}`,
      type: "action",
      priority: action.priority || (english ? "Important" : "مهمة"),
      title: action.action || action.output || (english ? "Improvement action" : "إجراء تحسين"),
      why: action.why_now || action.output || "",
      question: action.output
        ? (english ? `How will you produce this output: ${action.output}?` : `كيف ستنتج هذا المخرج: ${action.output}؟`)
        : (english ? "What evidence will prove this action is complete?" : "ما الدليل الذي سيثبت اكتمال هذا الإجراء؟"),
      completed: false,
    }));
    return tasks.slice(0, 30);
  }

  function buildRound(assessment, at = new Date().toISOString()) {
    return {
      at,
      score: score(assessment),
      evidence_score: Number(assessment?.readiness?.evidence_strength_score || 0),
      eligibility: assessment?.eligibility?.status || "unknown",
      critical_gaps: list(assessment?.gaps).filter((gap) => /حرج|critical/i.test(String(gap.priority))).length,
    };
  }

  function compareRounds(previous, current) {
    return {
      score_change: previous?.score === null || current?.score === null ? null : Number(current?.score || 0) - Number(previous?.score || 0),
      evidence_change: Number(current?.evidence_score || 0) - Number(previous?.evidence_score || 0),
      closed_critical_gaps: Math.max(0, Number(previous?.critical_gaps || 0) - Number(current?.critical_gaps || 0)),
      eligibility_changed: previous?.eligibility !== current?.eligibility,
    };
  }

  return Object.freeze({ makeTasks, buildRound, compareRounds, score });
});
