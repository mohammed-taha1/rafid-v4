"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "frontend", "research-ui.js"), "utf8");

for (const text of [
  "قرار الأهلية الاسترشادي",
  "الملاءمة والجاهزية",
  "قوة الأدلة",
  "الشروط الصارمة",
  "الفجوات",
  "خطة إغلاق الفجوات",
  "حزمة التقديم",
  "نسخ الخلاصة",
  "طباعة التقرير",
  "تنزيل تقرير مقروء",
  "بدء تحليل جديد",
  "أهم فجوة الآن",
  "الإجراء التالي",
  "المراجعة البشرية",
]) assert.match(source, new RegExp(text));

assert.match(source, /text\/plain;charset=utf-8/);
assert.match(source, /URL\.revokeObjectURL/);
assert.match(source, /class="score-ring"/);
assert.match(source, /aria-label="الملاءمة والجاهزية/);
console.log("Rafid opportunity report render contract passed.");
