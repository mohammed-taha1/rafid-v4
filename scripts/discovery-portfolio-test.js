"use strict";

const assert = require("node:assert/strict");
const { normalizeProjectData, validateProjectData } = require("../src/lib/normalize");
const { normalizeOpportunityData } = require("../src/lib/opportunity-normalize");
const {
  DISCOVERY_VERSION,
  DIMENSION_WEIGHTS,
  discoverOpportunities,
  publicCatalog,
} = require("../src/lib/funding-discovery");
const {
  PORTFOLIO_VERSION,
  MAX_PORTFOLIO_PROJECTS,
  comparePortfolio,
} = require("../src/lib/institutional-portfolio");

function project(title, complete) {
  return normalizeProjectData({
    project_identity: {
      project_title: title,
      field: complete ? ["تقنية المياه", "الذكاء الاصطناعي"] : [],
      project_type: complete ? ["تطوير تقنية", "ابتكار"] : [],
      team_members: complete ? [{ name: "", role: "هندسة", specialization: "مياه", relevant_experience: "اختبارات" }] : [],
      project_owner: { name: null, email: null, phone: null },
    },
    project_stage: { current_stage: complete ? "نموذج أولي" : "فكرة", trl_estimate: complete ? 4 : null },
    problem: { problem_statement: complete ? "تتأخر مرافق المياه في اكتشاف التسربات." : null },
    solution: { solution_summary: complete ? "تقنية حساسات ونموذج ذكاء اصطناعي لاكتشاف التسرب." : null },
    prototype_and_data: {
      prototype_exists: complete,
      test_results: complete ? ["اختبار مختبري أولي"] : [],
      attachments_or_links: [],
    },
    claims_and_evidence: complete ? [{ claim: "اكتشاف أولي", claim_type: "تقني", evidence_status: "مثبت جزئيًا", available_evidence: "نتيجة مختبر", evidence_source: "تقرير اختبار", additional_evidence_needed: "تجربة ميدانية" }] : [],
    impact: { expected_impact: complete ? ["خفض فاقد المياه"] : [], target_metrics: [] },
    implementation_plan: { implementation_summary: complete ? "تجربة ميدانية ثم تحسين النموذج" : null, duration: complete ? "12 شهرًا" : null },
    budget: { requested_amount: complete ? 500000 : null, budget_items: complete ? [{ item: "حساسات", category: "أجهزة", quantity: 10, unit_cost: 1000, total_cost: 10000, basis_of_estimate: "عرض مبدئي" }] : [] },
    risks: [],
    contradictions: [],
    assumptions_explicitly_stated_in_source: [],
    source_summary: { extraction_confidence: complete ? 85 : 35, sources_reviewed: ["fixture"], information_completeness: complete ? "مرتفعة" : "منخفضة", notes: "" },
  });
}

const strongProject = project("نظام ذكي لاكتشاف تسرب المياه", true);
const weakProject = project("فكرة غير مكتملة", false);
assert.equal(validateProjectData(strongProject).valid, true);

assert.equal(Object.values(DIMENSION_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 100);
const catalog = publicCatalog();
assert.ok(catalog.opportunities.length >= 8);
assert.ok(catalog.opportunities.every((item) => item.official_url.startsWith("https://")));
assert.ok(catalog.opportunities.every((item) => item.application_status === "تحقق من المصدر الرسمي"));

const discovery = discoverOpportunities(strongProject, { limit: 6 });
assert.equal(discovery.discovery_version, DISCOVERY_VERSION);
assert.equal(discovery.methodology.deterministic, true);
assert.equal(discovery.methodology.score_does_not_confirm_eligibility, true);
assert.equal(discovery.matches.length, 6);
assert.ok(discovery.matches.every((item, index) => item.rank === index + 1));
assert.ok(discovery.matches.every((item) => item.preliminary_eligibility === "غير محسوم"));
assert.ok(discovery.matches.every((item) => item.dimensions.reduce((sum, dimension) => sum + dimension.weight_percent, 0) === 100));
assert.deepEqual(
  discovery.matches.map((item) => item.match_score),
  discoverOpportunities(strongProject, { limit: 6 }).matches.map((item) => item.match_score),
);
assert.ok(discovery.matches.some((item) => item.opportunity.opportunity_id === "rdia-tdg"));
assert.doesNotMatch(JSON.stringify(discovery), /تتأخر مرافق المياه/);

const opportunity = normalizeOpportunityData({
  identity: {
    title: "منحة تطوير تقنيات المياه",
    funder: "جهة تمويل",
    official_source_url: "https://example.test/official-call",
    status: "غير معروف",
  },
  purpose_and_scope: { objectives: ["تطوير حلول للمياه"], eligible_project_types: ["تطوير تقنية"] },
  requirements: [{
    requirement_id: "req-official",
    category: "أهلية مقدم الطلب",
    title: "جهة بحثية مؤهلة",
    description: "يلزم التحقق من صفة الجهة.",
    requirement_type: "إلزامي",
    gate_type: "بوابة صارمة",
    evidence_required: ["خطاب الجهة"],
    source_quote: "التقديم للجهات البحثية المؤهلة",
    source_reference: "الدليل",
  }],
  submission_documents: [],
  evaluation_criteria: [],
  contradictions: [],
  missing_information: [],
  source_summary: { source_name: "الدليل", sections_reviewed: ["الأهلية"], information_completeness: "متوسطة", extraction_confidence: 80, notes: "" },
});

const portfolio = comparePortfolio(opportunity, [weakProject, strongProject]);
assert.equal(portfolio.portfolio_version, PORTFOLIO_VERSION);
assert.equal(portfolio.summary.total_projects, 2);
assert.equal(portfolio.methodology.deterministic, true);
assert.equal(portfolio.methodology.raw_research_retained, false);
assert.equal(portfolio.ranking[0].title, strongProject.project_identity.project_title);
assert.equal(portfolio.ranking[0].rank, 1);
assert.ok(portfolio.ranking[0].decision.evidence_score > portfolio.ranking[1].decision.evidence_score);
assert.equal(portfolio.ranking.every((row) => row.decision.reviewer_required), true);
assert.throws(() => comparePortfolio(opportunity, [strongProject]), /مشروعين على الأقل/);
assert.throws(
  () => comparePortfolio(opportunity, Array.from({ length: MAX_PORTFOLIO_PROJECTS + 1 }, () => strongProject)),
  /الحد الأقصى/,
);

console.log("Rafid discovery and institutional portfolio tests passed.");
