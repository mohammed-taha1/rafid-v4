"use strict";

const assert = require("node:assert/strict");
const { FUNDING_CATALOG } = require("../src/data/funding-catalog");
const {
  validateOpportunityRecord,
  publishableCatalog,
  criteriaFingerprint,
  evaluateStrictGates,
} = require("../src/lib/funding-registry");

assert.ok(FUNDING_CATALOG.length >= 8);
assert.ok(FUNDING_CATALOG.every((record) => validateOpportunityRecord(record).valid));
assert.equal(publishableCatalog(FUNDING_CATALOG).length, FUNDING_CATALOG.length);
assert.equal(publishableCatalog([{ ...FUNDING_CATALOG[0], review: { status: "draft" } }]).length, 0);
assert.equal(publishableCatalog([{ ...FUNDING_CATALOG[0], official_url: "http://unsafe.test" }]).length, 0);
assert.equal(criteriaFingerprint(FUNDING_CATALOG[0]), criteriaFingerprint(structuredClone(FUNDING_CATALOG[0])));

const unknown = evaluateStrictGates({}, FUNDING_CATALOG[0]);
assert.equal(unknown[0].status, "unknown");
assert.equal(evaluateStrictGates({ application_status: "verify_official_source" }, FUNDING_CATALOG[0])[0].status, "unknown");
const blocked = evaluateStrictGates({ application_status: "closed" }, FUNDING_CATALOG[0]);
assert.equal(blocked[0].status, "not_met");
assert.equal(blocked[0].blocking, true);
const met = evaluateStrictGates({ application_status: "open" }, FUNDING_CATALOG[0]);
assert.equal(met[0].status, "met");

console.log("Rafid verified funding registry tests passed.");
