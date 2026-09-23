"use strict";
const assert=require("node:assert/strict");
const {createAnalysis,emptyElements}=require("../src/lib/research-schema");
const {cleanMergedProject,createGroqAdapter,groupChunks,ProviderError,normalizeModelAnalysis}=require("../src/lib/research-provider");

assert.deepEqual(groupChunks(["a".repeat(4), "b".repeat(4), "c".repeat(4)], 10), ["aaaa\n\nbbbb", "cccc"]);
const cleaned=cleanMergedProject({project_identity:{team_members:[{name:"A.B."},{name:"Alice Smith"},{name:"alice smith"}]},project_stage:{trl_estimate:6,trl_reason:"مستنتج"},intellectual_property:{commercialization_restrictions:["CC BY-NC-ND article license","قيد تقني صريح"]}},"[PAGE 1] prototype",[{name:"paper.pdf"}],2);
assert.deepEqual(cleaned.project_identity.team_members.map((item)=>item.name),["Alice Smith"]);
assert.equal(cleaned.project_stage.trl_estimate,null);
assert.deepEqual(cleaned.intellectual_property.commercialization_restrictions,["قيد تقني صريح"]);

let requestOptions;
const client={chat:{completions:{create:async(_request,options)=>{
  requestOptions=options;
  return {choices:[{message:{content:JSON.stringify(createAnalysis({elements:emptyElements()}))}}]};
}}}};

const adapter=createGroqAdapter({client,model:"from-env",timeoutMs:50});
adapter.analyze({messages:[],requestId:"x",textSize:10}).then(async(result)=>{
  assert.equal(result.analysisVersion,"rafid.research-readiness.v1");
  assert.ok(requestOptions?.signal,"Abort signal must be a client request option, not provider JSON.");
  const normalized=normalizeModelAnalysis({researchSummary:"ملخص",extractedElements:{problem:{status:"موجود",summary:"مشكلة",evidence:["ص1"],assessmentNote:"واضحة"}}});
  assert.equal(normalized.extractedElements.problem.status,"موجود");
  assert.equal(normalized.technicalReadiness.score>0,true);
  const longSummary=Array.from({length:200},(_,index)=>`كلمة${index}`).join(" ");
  const safelyTruncated=normalizeModelAnalysis({sourceSummary:longSummary,researchSummary:"ملخص",extractedElements:{problem:{status:"موجود",summary:"مشكلة",evidence:["[PAGE 1]"],assessmentNote:"واضحة"}}}).sourceSummary;
  assert.equal(safelyTruncated.endsWith("…"),true);
  assert.equal(longSummary.startsWith(safelyTruncated.slice(0,-1)),true);
  assert.equal(longSummary[safelyTruncated.length-1]," ","Truncation must stop at a word boundary.");
  const bad=createGroqAdapter({client:{chat:{completions:{create:async()=>({choices:[{message:{content:"{}"}}]})}}},model:"m"});
  await assert.rejects(()=>bad.analyze({messages:[]}),error=>error instanceof ProviderError&&error.kind==="invalid_response");
  console.log("Rafid resilient provider tests passed.");
});
