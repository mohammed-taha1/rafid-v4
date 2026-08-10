"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("frontend/index.html");
const i18n = read("frontend/rafid-i18n.js");
const institution = read("frontend/institution-workspace.js");
const education = read("frontend/education-content-en.js");
const research = read("frontend/research-ui.js");

assert.match(html, /lang="ar" dir="rtl"/, "Arabic must remain the safe default.");
assert.match(i18n, /document\.documentElement\.dir = language === "ar" \? "rtl" : "ltr"/, "Direction must follow the selected language.");
assert.match(i18n, /data-rafid-language="en"/, "An English control is required.");
assert.match(institution, /Rafid for research institutions/, "Institution experience requires English copy.");
assert.match(education, /Research funding[^]*Pre-submission readiness/s, "The full learning center needs English content.");
assert.match(research, /output_language: window\.RafidI18n/, "Research analysis must request the selected output language.");
assert.match(research, /General assessment result/, "Dynamic general-analysis results require English labels.");
assert.match(research, /Reading content… Analyzing elements… Scoring readiness… Preparing recommendations…/, "Dynamic progress must follow the selected language.");
assert.match(i18n, /\[placeholder\]/, "English mode must translate input placeholders.");
assert.doesNotMatch(i18n + institution + education, /gsk_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}/, "No provider secret may enter bilingual assets.");
console.log("Rafid Arabic/English navigation, content, direction, and output-language checks passed.");
