"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const files=["research-ui.js","results-report.js","education-content.js","rafid-brand.js"].map(f=>fs.readFileSync(path.join(__dirname,"..","frontend",f),"utf8")).join("\n");
for(const text of ["PDF","DOCX","TXT","إلغاء","طباعة التقرير","غير موضح","الخصوصية","faq","رافد"]){assert.match(files,new RegExp(text));}assert.doesNotMatch(files,/gsk_[A-Za-z0-9_-]{20,}/);console.log("Rafid MVP final UI coverage passed.");
