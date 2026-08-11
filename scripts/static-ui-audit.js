"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const frontend = path.join(root, "frontend");
const html = fs.readFileSync(path.join(frontend, "index.html"), "utf8");
const ui = fs.readFileSync(path.join(frontend, "research-ui.js"), "utf8");
const config = fs.readFileSync(path.join(frontend, "rafid-config.js"), "utf8");
const ingest = fs.readFileSync(path.join(frontend, "rafid-ingest.js"), "utf8");
const demo = fs.readFileSync(path.join(frontend, "demo-data.js"), "utf8");
const css = fs.readFileSync(path.join(frontend, "rafid-v4.css"), "utf8");

const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
assert.deepEqual(duplicates, [], `Duplicate HTML ids: ${duplicates.join(", ")}`);

for (const match of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
  const reference = match[1];
  assert.ok(!/^https?:/i.test(reference), `Runtime external asset is not allowed: ${reference}`);
  assert.ok(fs.existsSync(path.join(frontend, reference)), `Missing frontend asset: ${reference}`);
}

for (const reference of ["vendor/pdf.min.mjs", "vendor/pdf.worker.min.mjs"]) {
  assert.ok(fs.existsSync(path.join(frontend, reference)), `Missing local PDF asset: ${reference}`);
  assert.match(ingest, new RegExp(reference.replaceAll(".", "\\.")), `PDF asset is not referenced: ${reference}`);
}

assert.match(html, /lang="ar"\s+dir="rtl"/, "Arabic RTL metadata is required.");
assert.match(html, /id="rafidApp"[^>]+class="rafid rafid-boot"/, "The first paint must use the current Rafid shell.");
assert.match(html, /قرار أوضح لبحثك قبل التقديم/, "The first paint must match the current product message.");
assert.match(css, /brand-logo-(?:crop|frame)[^}]+border-radius:50%/, "The header logo must render in a circular brand frame.");
assert.match(css, /service-card-top\{[^}]+justify-content:space-between/, "Service metadata must use a collision-safe header row.");
assert.match(css, /@media\(max-width:620px\)\{[^}]*\.service-grid\{grid-template-columns:1fr\}/, "Services must use one readable column on small phones.");
assert.match(css, /\.match-progress span\{display:grid;grid-template-columns:18px minmax\(0,1fr\)/, "Analysis progress markers need a dedicated column that cannot overlap their labels.");
assert.match(css, /\.match-progress span::before\{position:static[^}]+transform:none/, "Analysis progress markers must participate in layout instead of using absolute positioning.");
assert.doesNotMatch(html, /class="topbar"|class="app-shell"|id="authGate"/, "Legacy UI must not exist in the entry document.");
assert.doesNotMatch(html, /rafid-v4\.js|results-report\.js|optional-feedback\.js|supabase\.min\.js/, "Unused legacy bundles must not load.");
assert.match(html, /rafid-config\.js[^]*research-ui\.js/, "Central product configuration must load before the UI.");
assert.match(config, /productName:\s*"رافد"/, "Product name must remain centralized.");
assert.match(ui, /void loadRuntime\(\)/, "Public runtime configuration must not block first paint.");
assert.match(ui, /RafidDemoData/, "The labeled training fixture must be available from the analysis form.");
assert.match(ui, /تنزيل تقرير مقروء/, "The result must offer a readable report download.");
assert.match(ui, /service-console/, "The landing page must present clear service entry points.");
assert.match(ui, /حلّل جاهزية بحثك/, "General readiness analysis must be a first-class service.");
assert.match(ui, /قارن بحثك بفرصة تمويل/, "Opportunity matching must be a first-class service.");
assert.match(ui, /researchFile[^]*multiple/, "Research intake must support multiple files.");
assert.match(ui, /workflow-stepper/, "Opportunity matching must use a short guided workflow.");
assert.match(ingest, /PDF وDOCX وTXT وMD/, "Document ingestion must clearly expose supported types.");
assert.match(ui, /report-command/, "The report must lead with an executive next-action summary.");
for (const code of ["RAFID_GLOBAL_DAILY_LIMIT", "RAFID_USER_RATE_LIMIT", "RAFID_PROVIDER_TIMEOUT", "RAFID_PROVIDER_UNAVAILABLE", "RAFID_INVALID_PROVIDER_RESPONSE", "RAFID_GROQ_UNAVAILABLE", "RAFID_GROQ_RATE_LIMITED", "RAFID_PROVIDER_NOT_CONFIGURED", "RAFID_ZDR_REQUIRED", "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED"]) {
  assert.match(ui, new RegExp(code), `A safe Arabic UI message is required for ${code}.`);
}
assert.match(demo, /مثال تدريبي غير مرتبط بجهة حقيقية/, "Training data must not be presented as real funding data.");
assert.doesNotMatch(html + ui + demo, /gsk_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}/, "Potential API secret embedded in frontend.");
assert.doesNotMatch(html + ui, /service[_-]?role/i, "A service-role secret must never enter the frontend.");
assert.match(ingest, /INGEST_PDF_NO_TEXT/, "Image-only PDFs must be rejected without claiming OCR.");

console.log("Rafid static UI audit passed: single current shell, local assets, RTL, privacy, and secret scan.");
