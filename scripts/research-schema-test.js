"use strict";
const assert = require("node:assert/strict");
const { TECHNICAL_RUBRIC, FUNDING_RUBRIC, createAnalysis, emptyElements, scoreAnalysis, validateAnalysis } = require("../src/lib/research-schema");
assert.equal(Object.values(TECHNICAL_RUBRIC).reduce((a,b)=>a+b,0),100); assert.equal(Object.values(FUNDING_RUBRIC).reduce((a,b)=>a+b,0),100);
const elements = emptyElements(); elements.problem = { status:"موجود", summary:"مشكلة موثقة", evidence:[{page:1,excerpt:"مشكلة"}], assessmentNote:"مدعومة بالنص." }; elements.objectives = { status:"جزئي", summary:"هدف عام", evidence:[], assessmentNote:"يحتاج قياسًا." };
const scores=scoreAnalysis(elements); assert.equal(scores.technical.score,15); assert.equal(scores.funding.score,10); const analysis=createAnalysis({elements}); assert.equal(validateAnalysis(analysis).valid,true); analysis.technicalReadiness.dimensions[0].explanation=""; assert.equal(validateAnalysis(analysis).valid,false); console.log("Rafid research schema and scoring tests passed.");
