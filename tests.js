"use strict";

const assert = require("node:assert/strict");
const { smartTruncate, assertDataPolicy } = require("./src/lib/ai");
const {
  normalizeProjectData,
  validateProjectData,
  buildMissingInformation,
} = require("./src/lib/normalize");
const {
  normalizeOpportunityData,
  validateOpportunityData,
} = require("./src/lib/opportunity-normalize");
const {
  deriveEligibility,
  normalizeAssessmentData,
  validateAssessmentData,
  portfolioSort,
} = require("./src/lib/assessment-normalize");
const { normalizePrivacy } = require("./src/lib/privacy");

const sample = {
  project_identity: {
    project_title: "مشروع اختبار",
    alternative_title: null,
    field: ["تقنية"],
    project_type: ["ابتكار"],
    university: null,
    college: null,
    department: null,
    project_owner: { name: null, email: null, phone: null },
    team_members: [],
  },
  project_stage: {
    current_stage: "فكرة",
    trl_estimate: null,
    trl_reason: "لا يوجد نموذج",
    development_history: null,
    current_status: null,
    completed_work: [],
    remaining_work: [],
  },
  problem: {
    problem_statement: "مشكلة واضحة للاختبار.",
    who_experiences_the_problem: [],
    current_alternatives: [],
    limitations_of_current_alternatives: [],
    problem_scale: null,
    problem_frequency: null,
    supporting_evidence: [],
  },
  solution: {
    solution_summary: "حل واضح للاختبار.",
    how_it_works: "يعمل بطريقة أولية.",
    main_components: [],
    innovation_or_differentiation: [],
    technical_architecture: [],
    dependencies: [],
    limitations: [],
  },
  beneficiaries_and_market: {
    primary_beneficiaries: [],
    secondary_beneficiaries: [],
    target_customer: [],
    first_target_segment: null,
    use_cases: [],
    market_validation: [],
    market_size_information: null,
    competitors_or_alternatives: [],
  },
  prototype_and_data: {
    prototype_exists: false,
    prototype_type: null,
    prototype_description: null,
    prototype_status: null,
    test_environment: null,
    tests_completed: [],
    test_results: [],
    data_available: false,
    data_description: null,
    data_source: null,
    data_size: null,
    data_quality_notes: null,
    attachments_or_links: [],
  },
  claims_and_evidence: [],
  impact: {
    expected_impact: [],
    economic_impact: null,
    environmental_impact: null,
    social_impact: null,
    academic_or_research_impact: null,
    target_metrics: [],
  },
  implementation_plan: {
    implementation_summary: null,
    duration: null,
    phases: [],
    required_resources: [],
    required_facilities: [],
    required_approvals: [],
    technical_requirements: [],
    operational_requirements: [],
  },
  budget: {
    requested_amount: null,
    currency: "ريال سعودي",
    budget_range: { minimum: null, maximum: null },
    budget_status: "غير موجودة",
    budget_items: [],
    co_funding_or_in_kind_support: [],
    budget_assumptions: [],
  },
  business_and_sustainability: {
    business_model: null,
    revenue_sources: [],
    pricing_model: null,
    customer_acquisition_method: null,
    operating_model: null,
    scalability: null,
    financial_sustainability: null,
    post_funding_plan: null,
  },
  funding_request: {
    funding_needed_for: [],
    preferred_funding_type: [],
    preferred_funder_categories: [],
    target_funders_mentioned: [],
    non_cash_support_needed: [],
    funding_deadline: null,
    value_for_funder: null,
    visibility_or_sponsorship_benefits: [],
  },
  partnerships: {
    existing_partners: [],
    letters_of_interest: [],
    required_partners: [],
    potential_partners: [],
  },
  intellectual_property: {
    ip_status: "غير محدد",
    ownership: null,
    inventors_or_authors: [],
    third_party_ip_dependencies: [],
    publication_status: null,
    commercialization_restrictions: [],
  },
  regulatory_and_ethical: {
    regulatory_requirements: [],
    licenses_or_certifications: [],
    ethical_approval_required: null,
    ethical_approval_status: null,
    data_privacy_requirements: [],
    safety_requirements: [],
    legal_notes: [],
  },
  risks: [],
  contradictions: [],
  assumptions_explicitly_stated_in_source: [],
  source_summary: {
    sources_reviewed: [],
    information_completeness: "منخفضة",
    extraction_confidence: 70,
    notes: "اختبار",
  },
};

const normalized = normalizeProjectData(sample, {
  metadata: { university: "جامعة تجريبية", owner: "محمد" },
  files: [{ name: "test.pdf" }],
});

assert.equal(normalized.project_identity.university, "جامعة تجريبية");
assert.equal(normalized.project_identity.project_owner.name, "محمد");
assert.ok(normalized.prototype_and_data.attachments_or_links.includes("test.pdf"));
assert.ok(buildMissingInformation(normalized).length > 0);
assert.equal(validateProjectData(normalized).valid, true);

const truncated = smartTruncate("x".repeat(1000), 100);
assert.equal(truncated.truncated, true);
assert.ok(truncated.text.length > 100);

const opportunity = normalizeOpportunityData(
  {
    identity: {
      opportunity_id: "",
      title: "منحة تجريبية",
      funder: "جهة تمويل",
      official_source_url: "https://example.test/call",
      deadline: "2026-09-01",
    },
    requirements: [
      {
        requirement_id: "req-org",
        title: "أن يكون مقدم الطلب جامعة سعودية",
        description: "التقديم متاح للجامعات السعودية فقط.",
        requirement_type: "إلزامي",
        gate_type: "بوابة صارمة",
        evidence_required: ["خطاب اعتماد الجهة"],
        source_quote: "متاح للجامعات السعودية فقط",
      },
      {
        requirement_id: "req-cofund",
        title: "تمويل مشترك 20%",
        description: "يلزم إثبات التمويل المشترك.",
        requirement_type: "إلزامي",
        gate_type: "بوابة صارمة",
        evidence_required: ["خطاب التزام مالي"],
        source_quote: "تمويل مشترك لا يقل عن 20%",
      },
    ],
    submission_documents: [],
    evaluation_criteria: [],
    contradictions: [],
    missing_information: [],
    source_summary: { extraction_confidence: 87, sections_reviewed: [] },
  },
  { metadata: { source_name: "الدليل الرسمي" } },
);

assert.match(opportunity.identity.opportunity_id, /^opp-/);
assert.equal(validateOpportunityData(opportunity).valid, true);

const baseAssessment = {
  hard_gates: [
    {
      requirement_id: "req-org",
      requirement: "أن يكون مقدم الطلب جامعة سعودية",
      status: "غير مستوفى",
      resolution: "غير قابل للإصلاح لهذه الدورة",
      verdict_basis: "الجهة المقدمة شركة تجارية وفق المصدر.",
      project_evidence: [],
      missing_evidence: [],
      remediation: "اختيار فرصة أخرى أو التقديم عبر جهة مؤهلة إن سمحت اللوائح.",
      owner_role: "مكتب البحث",
      due_date: null,
      opportunity_source_quote: "متاح للجامعات السعودية فقط",
    },
  ],
  fit_dimensions: [
    {
      dimension: "قوة الحل",
      score: 99,
      weight_percent: 100,
      rationale: "اختبار أن الدرجة لا تتغلب على شرط الأهلية.",
      evidence: [],
      improvement: "",
    },
  ],
  readiness: {
    opportunity_readiness_score: 99,
    evidence_strength_score: 90,
    assessment_confidence: 90,
    summary: "مشروع قوي لكنه غير مؤهل.",
  },
  gaps: [],
  action_plan: [],
  application_package: [],
  institutional_review: {
    recommendation: "لا يوصى لهذه الدورة",
    rationale: "فشل بوابة أهلية.",
    questions_for_project_team: [],
    questions_for_funder: [],
    reviewer_attention_points: [],
    institutional_review_required: false,
  },
  risk_disclosures: [],
};

const normalizedAssessment = normalizeAssessmentData(baseAssessment, {
  opportunity,
  project: normalized,
});
assert.equal(normalizedAssessment.hard_gates.length, 2);
assert.equal(normalizedAssessment.hard_gates[1].status, "غير معروف");
assert.equal(normalizedAssessment.eligibility.status, "غير مؤهل");
assert.equal(normalizedAssessment.eligibility.can_submit_now, false);
assert.equal(normalizedAssessment.institutional_review.institutional_review_required, true);
assert.equal(validateAssessmentData(normalizedAssessment).valid, true);
assert.equal(
  deriveEligibility([
    { status: "مستوفى", resolution: "مغلق" },
    { status: "غير معروف", resolution: "يحتاج تحقق" },
  ]).status,
  "غير محسوم",
);

const sorted = [
  { assessment: { eligibility: { status: "غير مؤهل" }, readiness: { opportunity_readiness_score: 99 } } },
  { assessment: { eligibility: { status: "مؤهل بشروط" }, readiness: { opportunity_readiness_score: 70 } } },
].sort(portfolioSort);
assert.equal(sorted[0].assessment.eligibility.status, "مؤهل بشروط");

assert.equal(
  normalizePrivacy({
    privacy: {
      classification: "confidential",
      remote_processing_confirmed: true,
      redaction_preview_confirmed: true,
      redactions_applied: ["email"],
    },
  }).classification,
  "confidential",
);
assert.throws(
  () =>
    normalizePrivacy({
      privacy: {
        classification: "restricted",
        remote_processing_confirmed: true,
        redaction_preview_confirmed: true,
      },
    }),
  /المحتوى المقيّد/,
);
assert.throws(() => normalizePrivacy({}), /بوابة الخصوصية/);

const previousDataPolicy = process.env.RAFID_DATA_POLICY;
const previousZdr = process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED;
const previousGroqZdr = process.env.GROQ_ZERO_DATA_RETENTION_CONFIRMED;
const previousConfidential = process.env.RAFID_ALLOW_CONFIDENTIAL_STANDARD_PROCESSING;
process.env.RAFID_DATA_POLICY = "strict_zdr";
process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED = "false";
assert.throws(
  () => assertDataPolicy({ provider: "openai" }, { classification: "internal" }),
  /Zero Data Retention/,
);
process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED = "true";
assert.equal(
  assertDataPolicy({ provider: "openai" }, { classification: "confidential" }).store,
  false,
);
process.env.RAFID_DATA_POLICY = "standard";
process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED = "false";
process.env.RAFID_ALLOW_CONFIDENTIAL_STANDARD_PROCESSING = "false";
assert.throws(
  () => assertDataPolicy({ provider: "openai" }, { classification: "confidential" }),
  /المحتوى السري/,
);
process.env.RAFID_DATA_POLICY = "strict_zdr";
process.env.GROQ_ZERO_DATA_RETENTION_CONFIRMED = "false";
assert.throws(
  () => assertDataPolicy({ provider: "groq" }, { classification: "internal" }),
  /Zero Data Retention/,
);
process.env.GROQ_ZERO_DATA_RETENTION_CONFIRMED = "true";
const groqPolicy = assertDataPolicy(
  { provider: "groq" },
  { classification: "confidential" },
);
assert.equal(groqPolicy.provider_retention, "zero_data_retention");
assert.equal(groqPolicy.usage_metadata_retained, true);
if (previousDataPolicy === undefined) delete process.env.RAFID_DATA_POLICY;
else process.env.RAFID_DATA_POLICY = previousDataPolicy;
if (previousZdr === undefined) delete process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED;
else process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED = previousZdr;
if (previousGroqZdr === undefined) delete process.env.GROQ_ZERO_DATA_RETENTION_CONFIRMED;
else process.env.GROQ_ZERO_DATA_RETENTION_CONFIRMED = previousGroqZdr;
if (previousConfidential === undefined) delete process.env.RAFID_ALLOW_CONFIDENTIAL_STANDARD_PROCESSING;
else process.env.RAFID_ALLOW_CONFIDENTIAL_STANDARD_PROCESSING = previousConfidential;

console.log("All Rafid backend tests passed.");
