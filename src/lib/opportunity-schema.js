"use strict";

const string = { type: "string" };
const number = { type: "number" };
const integer = { type: "integer" };
const boolean = { type: "boolean" };
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const array = (items) => ({ type: "array", items });
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const enumString = (values) => ({ type: "string", enum: values });

const requirement = object({
  requirement_id: string,
  category: enumString([
    "أهلية مقدم الطلب",
    "نطاق المشروع",
    "مرحلة الجاهزية",
    "الفريق والشركاء",
    "الميزانية والتمويل المشترك",
    "المدة والجدول الزمني",
    "الأخلاقيات والتنظيم",
    "الملكية الفكرية",
    "الوثائق والتقديم",
    "معيار تقييم",
    "أخرى",
  ]),
  title: string,
  description: string,
  requirement_type: enumString(["إلزامي", "مفضل", "معلومة إرشادية"]),
  gate_type: enumString(["بوابة صارمة", "عامل مفاضلة", "ليس بوابة"]),
  evidence_required: array(string),
  source_quote: string,
  source_reference: string,
});

const documentItem = object({
  document_id: string,
  name: string,
  mandatory: boolean,
  description: string,
  source_quote: string,
  source_reference: string,
});

const evaluationCriterion = object({
  criterion_id: string,
  name: string,
  weight_percent: nullable(number),
  description: string,
  source_quote: string,
  source_reference: string,
});

const contradiction = object({
  topic: string,
  first_statement: string,
  conflicting_statement: string,
  clarification_needed: string,
});

const missingInformation = object({
  topic: string,
  question_for_funder: string,
  why_it_matters: string,
  impact: enumString(["يمنع تحديد الأهلية", "يؤثر في الجاهزية", "تحسين فقط"]),
});

const opportunitySchema = object({
  identity: object({
    opportunity_id: string,
    title: string,
    funder: nullable(string),
    program: nullable(string),
    official_source_url: nullable(string),
    announcement_date: nullable(string),
    deadline: nullable(string),
    status: enumString(["مفتوحة", "قادمة", "مغلقة", "غير معروف"]),
    country_or_region: nullable(string),
    source_language: string,
  }),
  purpose_and_scope: object({
    objectives: array(string),
    priority_areas: array(string),
    eligible_fields: array(string),
    eligible_project_types: array(string),
    excluded_activities: array(string),
    eligible_geographies: array(string),
    minimum_trl: nullable(integer),
    maximum_trl: nullable(integer),
  }),
  applicant_eligibility: object({
    eligible_applicant_types: array(string),
    lead_applicant_requirements: array(string),
    consortium_or_partner_requirements: array(string),
    nationality_or_location_requirements: array(string),
    prior_funding_or_experience_requirements: array(string),
  }),
  funding_terms: object({
    minimum_amount: nullable(number),
    maximum_amount: nullable(number),
    currency: nullable(string),
    maximum_funding_rate_percent: nullable(number),
    co_funding_required: nullable(boolean),
    co_funding_description: nullable(string),
    minimum_duration_months: nullable(integer),
    maximum_duration_months: nullable(integer),
    eligible_costs: array(string),
    ineligible_costs: array(string),
  }),
  requirements: array(requirement),
  submission_documents: array(documentItem),
  evaluation_criteria: array(evaluationCriterion),
  submission_process: object({
    submission_channel: nullable(string),
    required_steps: array(string),
    review_stages: array(string),
    expected_decision_date: nullable(string),
    contact_information: array(string),
  }),
  contradictions: array(contradiction),
  missing_information: array(missingInformation),
  source_summary: object({
    source_name: string,
    sections_reviewed: array(string),
    information_completeness: enumString(["مرتفعة", "متوسطة", "منخفضة"]),
    extraction_confidence: integer,
    notes: string,
  }),
});

const RAFID_OPPORTUNITY_SCHEMA = {
  type: "json_schema",
  name: "rafid_funding_opportunity",
  strict: true,
  schema: opportunitySchema,
};

module.exports = {
  RAFID_OPPORTUNITY_SCHEMA,
  opportunitySchema,
};
