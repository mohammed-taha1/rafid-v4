"use strict";

const crypto = require("node:crypto");

const REVIEW_STATUSES = new Set(["approved", "draft", "rejected", "needs_review"]);
const APPLICATION_STATUSES = new Set(["open", "closed", "upcoming", "verify_official_source"]);
const REQUIRED_FIELDS = [
  "opportunity_id", "title", "funder", "official_url", "last_verified_at",
  "application_status", "deadline", "eligible_countries", "eligible_disciplines", "applicant_types",
  "funding_ceiling", "partner_requirement", "readiness_requirement", "ip_and_licensing",
  "strict_gates", "criteria_version", "review",
];

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validateOpportunityRecord(record) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    const exists = Object.prototype.hasOwnProperty.call(record || {}, field);
    if (!exists || (field !== "deadline" && (record?.[field] === null || record?.[field] === ""))) {
      errors.push(`missing:${field}`);
    }
  }
  if (!/^https:\/\//.test(String(record?.official_url || ""))) errors.push("invalid:official_url");
  if (!isIsoDate(record?.last_verified_at)) errors.push("invalid:last_verified_at");
  if (!APPLICATION_STATUSES.has(record?.application_status)) errors.push("invalid:application_status");
  if (!Array.isArray(record?.eligible_countries) || !record.eligible_countries.length) errors.push("invalid:eligible_countries");
  if (!Array.isArray(record?.eligible_disciplines) || !record.eligible_disciplines.length) errors.push("invalid:eligible_disciplines");
  if (!Array.isArray(record?.applicant_types) || !record.applicant_types.length) errors.push("invalid:applicant_types");
  if (!Array.isArray(record?.strict_gates) || !record.strict_gates.length) errors.push("invalid:strict_gates");
  if (!REVIEW_STATUSES.has(record?.review?.status)) errors.push("invalid:review.status");
  if (record?.review?.status === "approved" && !isIsoDate(record?.review?.reviewed_at)) errors.push("invalid:review.reviewed_at");
  return { valid: errors.length === 0, errors };
}

function isPublishable(record) {
  return record?.review?.status === "approved" && validateOpportunityRecord(record).valid;
}

function publishableCatalog(records) {
  return (Array.isArray(records) ? records : []).filter(isPublishable);
}

function criteriaFingerprint(record) {
  const material = {
    criteria_version: record.criteria_version,
    eligible_countries: record.eligible_countries,
    eligible_disciplines: record.eligible_disciplines,
    applicant_types: record.applicant_types,
    funding_ceiling: record.funding_ceiling,
    partner_requirement: record.partner_requirement,
    readiness_requirement: record.readiness_requirement,
    ip_and_licensing: record.ip_and_licensing,
    strict_gates: record.strict_gates,
  };
  return crypto.createHash("sha256").update(JSON.stringify(material)).digest("hex").slice(0, 20);
}

function publicOpportunity(record) {
  return {
    ...structuredClone(record),
    criteria_fingerprint: criteriaFingerprint(record),
    review: {
      status: record.review.status,
      reviewed_at: record.review.reviewed_at,
      reviewer_role: record.review.reviewer_role,
    },
  };
}

function readPath(value, path) {
  return String(path || "").split(".").reduce((current, key) => current?.[key], value);
}

function evaluateStrictGates(facts, record) {
  return (record.strict_gates || []).map((gate) => {
    const actual = readPath(facts, gate.fact_path);
    let status = "unknown";
    if (actual !== undefined && actual !== null && actual !== "" && actual !== "verify_official_source") {
      if (gate.operator === "equals") status = actual === gate.expected ? "met" : "not_met";
      else if (gate.operator === "includes") status = Array.isArray(actual) && actual.includes(gate.expected) ? "met" : "not_met";
      else if (gate.operator === "gte") status = Number(actual) >= Number(gate.expected) ? "met" : "not_met";
      else if (gate.operator === "lte") status = Number(actual) <= Number(gate.expected) ? "met" : "not_met";
    }
    return {
      gate_id: gate.gate_id,
      title: gate.title,
      status,
      blocking: Boolean(gate.blocking),
      actual: actual ?? null,
      expected: gate.expected ?? null,
      verification: gate.verification,
    };
  });
}

module.exports = {
  validateOpportunityRecord,
  isPublishable,
  publishableCatalog,
  criteriaFingerprint,
  publicOpportunity,
  evaluateStrictGates,
};
