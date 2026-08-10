"use strict";
/* global module */

(function exposeOpportunityMatch(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RafidOpportunityMatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MATCH_VERSION = "rafid.opportunity-match.v1";
  const ELIGIBILITY = new Set(["مؤهل", "مؤهل بشروط", "غير محسوم", "غير مؤهل"]);

  function text(value) {
    return String(value ?? "").trim();
  }

  function list(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function validateInputs({ opportunityText, researchText }) {
    const errors = [];
    if (text(opportunityText).length < 100) {
      errors.push("أدخل 100 حرف على الأقل من نص فرصة التمويل أو ارفع ملف الفرصة.");
    }
    if (text(researchText).length < 30) {
      errors.push("أدخل 30 حرفًا على الأقل من البحث أو المشروع أو ارفع ملفه.");
    }
    return { valid: errors.length === 0, errors };
  }

  function buildOpportunityRequest(input) {
    return {
      source_text: text(input.opportunityText),
      metadata: {
        title: text(input.opportunityTitle) || null,
        funder: text(input.funder) || null,
        official_source_url: text(input.officialUrl) || null,
        deadline: text(input.deadline) || null,
        source_name: text(input.opportunitySourceName) || "نص أدخله المستخدم",
      },
      privacy: input.privacy,
    };
  }

  function buildProjectRequest(input) {
    return {
      schema_version: "rafid-project-data-v1",
      raw_text: text(input.researchText),
      metadata: {
        title: text(input.projectTitle) || "بحث أو مشروع المستخدم",
        university: null,
        owner: null,
        type: "بحث أو مشروع ابتكاري",
      },
      files: list(input.projectFiles).slice(0, 5).map((file) => ({
        name: text(file.name) || "ملف البحث",
        type: text(file.type) || "application/octet-stream",
        size: Math.max(0, Number(file.size) || 0),
      })),
      privacy: input.privacy,
    };
  }

  function buildAssessmentRequest({ opportunity, project, privacy, date }) {
    return {
      opportunity,
      project_data: project,
      context: {
        assessment_date: text(date) || new Date().toISOString().slice(0, 10),
        reviewer_role: "الباحث أو المراجع",
      },
      privacy,
    };
  }

  function decisionTone(status) {
    return {
      "مؤهل": "eligible",
      "مؤهل بشروط": "conditional",
      "غير محسوم": "unknown",
      "غير مؤهل": "ineligible",
    }[status] || "unknown";
  }

  function gateSummary(gates) {
    const summary = { total: 0, met: 0, partial: 0, missing: 0, unknown: 0 };
    for (const gate of list(gates)) {
      summary.total += 1;
      if (gate.status === "مستوفى") summary.met += 1;
      else if (gate.status === "مستوفى جزئيًا") summary.partial += 1;
      else if (gate.status === "غير مستوفى") summary.missing += 1;
      else summary.unknown += 1;
    }
    return summary;
  }

  function validateAssessment(assessment) {
    const errors = [];
    if (!assessment || typeof assessment !== "object") errors.push("نتيجة المطابقة غير موجودة.");
    if (!ELIGIBILITY.has(assessment?.eligibility?.status)) errors.push("حالة الأهلية غير صالحة.");
    for (const field of ["hard_gates", "fit_dimensions", "gaps", "action_plan", "application_package"]) {
      if (!Array.isArray(assessment?.[field])) errors.push(`قسم النتيجة غير صالح: ${field}`);
    }
    for (const score of [
      assessment?.readiness?.opportunity_readiness_score,
      assessment?.readiness?.evidence_strength_score,
      assessment?.readiness?.assessment_confidence,
    ]) {
      if (!Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 100) {
        errors.push("تحتوي النتيجة على درجة خارج النطاق 0–100.");
        break;
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function summaryText(assessment) {
    const status = text(assessment?.eligibility?.status) || "غير محسوم";
    const score = Math.round(Number(assessment?.readiness?.opportunity_readiness_score) || 0);
    const reason = text(assessment?.eligibility?.reason) || text(assessment?.readiness?.summary) || "لا توجد خلاصة كافية.";
    const next = list(assessment?.action_plan)[0]?.action || list(assessment?.gaps)[0]?.required_action || "راجع الشروط والأدلة يدويًا.";
    return `حالة الأهلية: ${status}. درجة الملاءمة والجاهزية: ${score} من 100. ${reason} الإجراء التالي: ${next}`;
  }

  return {
    MATCH_VERSION,
    validateInputs,
    buildOpportunityRequest,
    buildProjectRequest,
    buildAssessmentRequest,
    decisionTone,
    gateSummary,
    validateAssessment,
    summaryText,
  };
});
