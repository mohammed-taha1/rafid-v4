"use strict";
const assert=require("node:assert/strict");
const {createAnalysis,emptyElements}=require("../src/lib/research-schema");
const {createGroqAdapter,ProviderError,normalizeModelAnalysis}=require("../src/lib/research-provider");

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
  const bad=createGroqAdapter({client:{chat:{completions:{create:async()=>({choices:[{message:{content:"{}"}}]})}}},model:"m"});
  await assert.rejects(()=>bad.analyze({messages:[]}),error=>error instanceof ProviderError&&error.kind==="invalid_response");
  console.log("Rafid resilient provider tests passed.");
});
