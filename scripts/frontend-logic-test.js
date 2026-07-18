"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storage = () => ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
});

const context = {
  console,
  crypto: crypto.webcrypto,
  localStorage: storage(),
  sessionStorage: storage(),
  document: {
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  window: {},
  history: { replaceState: () => {} },
  location: { hash: "" },
  URL,
  Blob,
  Intl,
  Date,
  Math,
  RegExp,
  JSON,
  Object,
  Array,
  String,
  Number,
  Set,
  Map,
  Promise,
  structuredClone,
  setTimeout,
  clearTimeout,
};
context.globalThis = context;
vm.createContext(context);

const source = fs.readFileSync(
  path.join(__dirname, "..", "frontend", "rafid-v4.js"),
  "utf8",
);
vm.runInContext(
  `${source}\n;globalThis.__rafidTest = { redactPayload, clientEligibility, portfolioRank };`,
  context,
  { filename: "rafid-v4.js" },
);

const { redactPayload, clientEligibility, portfolioRank } = context.__rafidTest;
const redacted = redactPayload(
  {
    raw_text: "تواصل عبر researcher@example.org أو 0501234567، الهوية 1123456789، والمفتاح sk-1234567890abcdefgh.",
    project_identity: { project_owner: { name: "باحث حقيقي" } },
  },
  "internal",
  ["اختراع سري"],
);
assert.doesNotMatch(redacted.payload.raw_text, /researcher@example\.org/);
assert.doesNotMatch(redacted.payload.raw_text, /0501234567/);
assert.doesNotMatch(redacted.payload.raw_text, /1123456789/);
assert.doesNotMatch(redacted.payload.raw_text, /sk-1234567890abcdefgh/);
assert.equal(redacted.payload.project_identity.project_owner.name, "[محجوب:هوية شخص]");
assert.ok(redacted.counts.email >= 1);
assert.ok(redacted.counts.secret >= 1);

assert.equal(
  clientEligibility([
    { status: "مستوفى", resolution: "مغلق" },
    { status: "غير مستوفى", resolution: "غير قابل للإصلاح لهذه الدورة" },
  ]).status,
  "غير مؤهل",
);
assert.equal(
  clientEligibility([{ status: "غير معروف", resolution: "يحتاج تحقق" }]).status,
  "غير محسوم",
);
assert.ok(portfolioRank("مؤهل بشروط") < portfolioRank("غير مؤهل"));

console.log("All Rafid frontend logic tests passed.");
