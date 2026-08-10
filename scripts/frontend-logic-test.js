"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const match = require("../frontend/opportunity-match");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "frontend", "demo-data.js"), "utf8"), context);

const demo = context.window.RafidDemoData;
assert.ok(Object.isFrozen(demo));
assert.match(demo.opportunity, /شروط الأهلية/);
assert.match(demo.opportunity, /المرفقات الإلزامية/);
assert.match(demo.research, /المنهجية/);
assert.match(demo.research, /المعلومات غير الموضحة/);
assert.equal(match.validateInputs({ opportunityText: demo.opportunity, researchText: demo.research }).valid, true);
assert.doesNotMatch(JSON.stringify(demo), /@|05\d{8}|https?:\/\//, "Training fixture must not contain personal or live-source data.");

console.log("Rafid frontend training journey tests passed.");
