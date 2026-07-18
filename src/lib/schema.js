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

const teamMember = object({
  name: string,
  role: string,
  specialization: string,
  relevant_experience: string,
});

const supportingEvidence = object({
  evidence: string,
  evidence_type: string,
  evidence_status: enumString(["مثبت", "مثبت جزئيًا", "غير مثبت", "غير واضح"]),
  source: string,
});

const marketValidation = object({
  activity: enumString(["مقابلة", "استبيان", "تجربة", "خطاب اهتمام", "طلب شراء", "شراكة", "غير ذلك"]),
  number_or_scope: nullable(string),
  result: string,
  evidence_available: boolean,
  evidence_reference: nullable(string),
});

const claimEvidence = object({
  claim: string,
  claim_type: enumString(["تقني", "مالي", "سوقي", "بيئي", "اجتماعي", "تشغيلي", "بحثي", "تنظيمي"]),
  evidence_status: enumString(["مثبت", "مثبت جزئيًا", "غير مثبت"]),
  available_evidence: string,
  evidence_source: string,
  additional_evidence_needed: string,
});

const targetMetric = object({
  metric: string,
  current_value: nullable(number),
  target_value: nullable(number),
  unit: string,
  measurement_method: string,
  target_date: nullable(string),
});

const implementationPhase = object({
  phase: string,
  duration: string,
  activities: array(string),
  deliverables: array(string),
});

const budgetItem = object({
  item: string,
  category: enumString(["أجهزة", "برمجيات", "تصنيع", "رواتب", "استشارات", "اختبار", "تشغيل", "تسويق", "قانوني", "سفر", "تدريب", "غير ذلك"]),
  quantity: nullable(number),
  unit_cost: nullable(number),
  total_cost: nullable(number),
  basis_of_estimate: string,
});

const partner = object({
  organization: string,
  relationship_type: string,
  status: enumString(["مؤكد", "تفاوض", "محتمل", "غير واضح"]),
  evidence: string,
});

const risk = object({
  risk: string,
  type: enumString(["تقني", "مالي", "تشغيلي", "تنظيمي", "قانوني", "سوقي", "فريق", "ملكية فكرية", "بيانات", "سلامة"]),
  existing_mitigation: string,
  source_in_project_information: string,
});

const contradiction = object({
  topic: string,
  first_statement: string,
  conflicting_statement: string,
  clarification_needed: string,
});

const projectDataSchema = object({
  project_identity: object({
    project_title: string,
    alternative_title: nullable(string),
    field: array(string),
    project_type: array(string),
    university: nullable(string),
    college: nullable(string),
    department: nullable(string),
    project_owner: object({
      name: nullable(string),
      email: nullable(string),
      phone: nullable(string),
    }),
    team_members: array(teamMember),
  }),

  project_stage: object({
    current_stage: enumString(["فكرة", "نموذج تصوري", "نموذج أولي", "تجربة مخبرية", "تجربة ميدانية", "منتج أولي MVP", "جاهز للتوسع", "غير محدد"]),
    trl_estimate: nullable(integer),
    trl_reason: string,
    development_history: nullable(string),
    current_status: nullable(string),
    completed_work: array(string),
    remaining_work: array(string),
  }),

  problem: object({
    problem_statement: nullable(string),
    who_experiences_the_problem: array(string),
    current_alternatives: array(string),
    limitations_of_current_alternatives: array(string),
    problem_scale: nullable(string),
    problem_frequency: nullable(string),
    supporting_evidence: array(supportingEvidence),
  }),

  solution: object({
    solution_summary: nullable(string),
    how_it_works: nullable(string),
    main_components: array(string),
    innovation_or_differentiation: array(string),
    technical_architecture: array(string),
    dependencies: array(string),
    limitations: array(string),
  }),

  beneficiaries_and_market: object({
    primary_beneficiaries: array(string),
    secondary_beneficiaries: array(string),
    target_customer: array(string),
    first_target_segment: nullable(string),
    use_cases: array(string),
    market_validation: array(marketValidation),
    market_size_information: nullable(string),
    competitors_or_alternatives: array(string),
  }),

  prototype_and_data: object({
    prototype_exists: boolean,
    prototype_type: nullable(string),
    prototype_description: nullable(string),
    prototype_status: nullable(string),
    test_environment: nullable(string),
    tests_completed: array(string),
    test_results: array(string),
    data_available: boolean,
    data_description: nullable(string),
    data_source: nullable(string),
    data_size: nullable(string),
    data_quality_notes: nullable(string),
    attachments_or_links: array(string),
  }),

  claims_and_evidence: array(claimEvidence),

  impact: object({
    expected_impact: array(string),
    economic_impact: nullable(string),
    environmental_impact: nullable(string),
    social_impact: nullable(string),
    academic_or_research_impact: nullable(string),
    target_metrics: array(targetMetric),
  }),

  implementation_plan: object({
    implementation_summary: nullable(string),
    duration: nullable(string),
    phases: array(implementationPhase),
    required_resources: array(string),
    required_facilities: array(string),
    required_approvals: array(string),
    technical_requirements: array(string),
    operational_requirements: array(string),
  }),

  budget: object({
    requested_amount: nullable(number),
    currency: string,
    budget_range: object({
      minimum: nullable(number),
      maximum: nullable(number),
    }),
    budget_status: enumString(["مفصلة", "تقديرية", "غير موجودة"]),
    budget_items: array(budgetItem),
    co_funding_or_in_kind_support: array(string),
    budget_assumptions: array(string),
  }),

  business_and_sustainability: object({
    business_model: nullable(string),
    revenue_sources: array(string),
    pricing_model: nullable(string),
    customer_acquisition_method: nullable(string),
    operating_model: nullable(string),
    scalability: nullable(string),
    financial_sustainability: nullable(string),
    post_funding_plan: nullable(string),
  }),

  funding_request: object({
    funding_needed_for: array(string),
    preferred_funding_type: array(string),
    preferred_funder_categories: array(string),
    target_funders_mentioned: array(string),
    non_cash_support_needed: array(string),
    funding_deadline: nullable(string),
    value_for_funder: nullable(string),
    visibility_or_sponsorship_benefits: array(string),
  }),

  partnerships: object({
    existing_partners: array(partner),
    letters_of_interest: array(string),
    required_partners: array(string),
    potential_partners: array(string),
  }),

  intellectual_property: object({
    ip_status: enumString(["غير محدد", "لا توجد حماية", "طلب حماية", "براءة", "حقوق برمجية", "سر تجاري", "ترخيص"]),
    ownership: nullable(string),
    inventors_or_authors: array(string),
    third_party_ip_dependencies: array(string),
    publication_status: nullable(string),
    commercialization_restrictions: array(string),
  }),

  regulatory_and_ethical: object({
    regulatory_requirements: array(string),
    licenses_or_certifications: array(string),
    ethical_approval_required: nullable(boolean),
    ethical_approval_status: nullable(string),
    data_privacy_requirements: array(string),
    safety_requirements: array(string),
    legal_notes: array(string),
  }),

  risks: array(risk),
  contradictions: array(contradiction),
  assumptions_explicitly_stated_in_source: array(string),

  source_summary: object({
    sources_reviewed: array(string),
    information_completeness: enumString(["مرتفعة", "متوسطة", "منخفضة"]),
    extraction_confidence: integer,
    notes: string,
  }),
});

const RAFID_EXTRACTION_SCHEMA = {
  type: "json_schema",
  name: "rafid_project_data",
  strict: true,
  schema: projectDataSchema,
};

module.exports = {
  RAFID_EXTRACTION_SCHEMA,
  projectDataSchema,
};
