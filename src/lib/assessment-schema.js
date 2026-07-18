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

const evidence = object({
  evidence: string,
  source: string,
  strength: enumString(["صريح", "جزئي", "غير مباشر", "غير متوفر"]),
});

const hardGate = object({
  requirement_id: string,
  requirement: string,
  status: enumString(["مستوفى", "مستوفى جزئيًا", "غير مستوفى", "غير معروف", "لا ينطبق"]),
  resolution: enumString([
    "مغلق",
    "قابل للإغلاق",
    "يحتاج تحقق",
    "غير قابل للإصلاح لهذه الدورة",
    "لا يلزم",
  ]),
  verdict_basis: string,
  project_evidence: array(evidence),
  missing_evidence: array(string),
  remediation: string,
  owner_role: string,
  due_date: nullable(string),
  opportunity_source_quote: string,
});

const fitDimension = object({
  dimension: enumString([
    "توافق النطاق",
    "قوة المشكلة",
    "قوة الحل",
    "الأدلة والاختبارات",
    "الفريق والشراكات",
    "خطة التنفيذ",
    "الميزانية",
    "الأثر",
    "معايير المفاضلة",
  ]),
  score: integer,
  weight_percent: number,
  rationale: string,
  evidence: array(string),
  improvement: string,
});

const gap = object({
  gap_id: string,
  severity: enumString(["مانع", "حرج", "مهم", "تحسيني"]),
  related_requirement_id: string,
  title: string,
  current_state: string,
  required_action: string,
  evidence_to_produce: array(string),
  owner_role: string,
  due_date: nullable(string),
  completion_criterion: string,
  status: enumString(["مفتوحة", "قيد العمل", "مغلقة", "مؤجلة"]),
});

const action = object({
  action_id: string,
  priority: integer,
  action: string,
  why_now: string,
  owner_role: string,
  due_date: nullable(string),
  dependency: nullable(string),
  output: string,
  related_gap_ids: array(string),
});

const packageItem = object({
  document_id: string,
  document_name: string,
  mandatory: boolean,
  status: enumString(["جاهز", "مسودة", "ناقص", "غير معروف", "لا ينطبق"]),
  available_evidence: string,
  missing_content: array(string),
  next_action: string,
  owner_role: string,
});

const assessmentSchema = object({
  assessment_id: string,
  project_snapshot: object({
    project_title: string,
    project_owner: nullable(string),
    organization: nullable(string),
    project_stage: string,
  }),
  opportunity_snapshot: object({
    opportunity_id: string,
    title: string,
    funder: nullable(string),
    deadline: nullable(string),
  }),
  hard_gates: array(hardGate),
  fit_dimensions: array(fitDimension),
  readiness: object({
    opportunity_readiness_score: integer,
    evidence_strength_score: integer,
    assessment_confidence: integer,
    summary: string,
  }),
  gaps: array(gap),
  action_plan: array(action),
  application_package: array(packageItem),
  institutional_review: object({
    recommendation: enumString(["يوصى بالتقديم", "يوصى بعد استكمال الشروط", "لا يوصى لهذه الدورة", "تحتاج قرارًا مؤسسيًا"]),
    rationale: string,
    questions_for_project_team: array(string),
    questions_for_funder: array(string),
    reviewer_attention_points: array(string),
    institutional_review_required: boolean,
  }),
  risk_disclosures: array(string),
});

const RAFID_ASSESSMENT_SCHEMA = {
  type: "json_schema",
  name: "rafid_opportunity_assessment",
  strict: true,
  schema: assessmentSchema,
};

module.exports = {
  RAFID_ASSESSMENT_SCHEMA,
  assessmentSchema,
};
