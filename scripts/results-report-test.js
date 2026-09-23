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
  "الأدلة والتناقضات",
  "مراجع ثانٍ مستقل",
  "إصدار الـRubric",
]) assert.match(source, new RegExp(text));

assert.match(source, /text\/plain;charset=utf-8/);
assert.match(source, /URL\.revokeObjectURL/);
assert.match(source, /class="score-ring"/);
assert.match(source, /aria-label="الملاءمة والجاهزية/);
for (const text of [
  "تفسير الجاهزية التقنية",
  "تفسير الجاهزية التمويلية",
  "العناصر والأدلة المستخرجة",
  "نقاط القوة",
  "النواقص المهمة",
  "تحسينات إضافية",
  "أسئلة للباحث",
  "قائمة تحقق قبل التقديم",
  "القيود والتنبيهات",
  "طباعة التقرير الكامل",
]) assert.match(source, new RegExp(text));
assert.match(source, /problem: \["وضوح المشكلة", "Problem clarity"\]/);
assert.match(source, /fundingFit: \["الملاءمة التمويلية العامة", "General funding fit"\]/);
assert.match(source, /function printCompleteReport\(container\)/);
assert.match(source, /details\.forEach\(\(entry\) => \{ entry\.open = true; \}\)/);
assert.match(source, /class="source-locator"/);
console.log("Rafid opportunity report render contract passed.");
