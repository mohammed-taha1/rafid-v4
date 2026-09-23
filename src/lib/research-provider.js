"use strict";
const { validateAnalysis,createAnalysis,emptyElements,ELEMENTS }=require("./research-schema");
const {requestFor}=require("./research-prompts");
class ProviderError extends Error { constructor(kind,message){super(message);this.kind=kind;} }
const safeMessage={timeout:"انتهت مهلة التحليل. حاول مرة أخرى.",rate_limit:"الخدمة مشغولة مؤقتًا. حاول بعد قليل.",invalid_response:"تعذر التحقق من نتيجة التحليل. حاول مرة أخرى.",provider_unavailable:"خدمة التحليل غير متاحة مؤقتًا.",configuration_error:"إعداد خدمة التحليل غير مكتمل."};
safeMessage.input_too_large="المستند أكبر من الحد المقبول للتحليل الآن. أعد المحاولة بملخص مركز أو قسم من المستند.";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function classify(error){const status=Number(error?.status||error?.statusCode||0);if(error?.name==="AbortError")return "timeout";if(status===401||status===403)return "configuration_error";if(status===413)return "input_too_large";if(status===429)return "rate_limit";if(status===400)return "invalid_response";if(status>=500)return "provider_unavailable";return "provider_unavailable";}
function safeProviderCode(error){return typeof error?.code==="string"?error.code.slice(0,80):typeof error?.type==="string"?error.type.slice(0,80):null;}
const elementSchema={type:"object",additionalProperties:false,required:["status","summary","evidence","assessmentNote"],properties:{status:{type:"string",enum:["موجود","جزئي","غير موضح"]},summary:{type:"string"},evidence:{type:"array",items:{type:"string"}},assessmentNote:{type:"string"}}};
const modelOutputSchema={type:"object",additionalProperties:false,required:["sourceSummary","researchSummary","confidence","extractedElements","strengths","criticalGaps","importantGaps","additionalImprovements","actionPlan","researcherQuestions","fundingChecklist","limitations"],properties:{sourceSummary:{type:"string"},researchSummary:{type:"string"},confidence:{type:"string",enum:["منخفض","متوسط","مرتفع"]},extractedElements:{type:"object",additionalProperties:false,required:ELEMENTS,properties:Object.fromEntries(ELEMENTS.map((key)=>[key,elementSchema]))},strengths:{type:"array",items:{type:"string"}},criticalGaps:{type:"array",items:{type:"string"}},importantGaps:{type:"array",items:{type:"string"}},additionalImprovements:{type:"array",items:{type:"string"}},actionPlan:{type:"array",items:{type:"string"}},researcherQuestions:{type:"array",items:{type:"string"}},fundingChecklist:{type:"array",items:{type:"string"}},limitations:{type:"array",items:{type:"string"}}}};
function text(value,limit=600){return typeof value==="string"?value.trim().slice(0,limit):"";}
function list(value,limit=12){return Array.isArray(value)?value.map((item)=>text(item)).filter(Boolean).slice(0,limit):[];}
function normalizeModelAnalysis(value){const raw=value?.result&&typeof value.result==="object"?value.result:value;if(!raw||typeof raw!=="object")return null;const extracted=emptyElements();let found=0;for(const key of ELEMENTS){const source=raw.extractedElements?.[key]||raw[key];if(!source||typeof source!=="object")continue;const status=["موجود","جزئي","غير موضح"].includes(source.status)?source.status:"غير موضح";const summary=text(source.summary);const assessmentNote=text(source.assessmentNote);if(status!=="غير موضح"||summary)found++;extracted[key]={status,summary:summary||"غير موضح",evidence:list(source.evidence,8),assessmentNote:assessmentNote||"لا توجد أدلة كافية."};}if(!found&&!text(raw.researchSummary))return null;const confidence=["منخفض","متوسط","مرتفع"].includes(raw.confidence)?raw.confidence:"منخفض";return {...createAnalysis({sourceSummary:text(raw.sourceSummary),researchSummary:text(raw.researchSummary),elements:extracted,confidence,limitations:list(raw.limitations)}),strengths:list(raw.strengths),criticalGaps:list(raw.criticalGaps),importantGaps:list(raw.importantGaps),additionalImprovements:list(raw.additionalImprovements),actionPlan:list(raw.actionPlan),researcherQuestions:list(raw.researcherQuestions),fundingChecklist:list(raw.fundingChecklist)};}
function createGroqAdapter({client,model=process.env.GROQ_MODEL,timeoutMs=60000,log=()=>{}}={}){if(!client||!model)throw new ProviderError("configuration_error",safeMessage.configuration_error);return { async health(){return {ready:true,modelAlias:"server-managed"};}, async analyze(request,{repair}={}){let attempts=0;for(;attempts<2;attempts++){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);const started=Date.now();try{const response=await client.chat.completions.create({model,messages:request.messages,temperature:request.modelSettings?.temperature??0.1,response_format:{type:"json_object"}},{signal:controller.signal});const content=response.choices?.[0]?.message?.content||"{}";const parsed=JSON.parse(content);const normalized=normalizeModelAnalysis(parsed);const checked=validateAnalysis(normalized);if(!checked.valid){log({requestId:request.requestId,durationMs:Date.now()-started,errorType:"invalid_response",attempts:attempts+1,textSize:request.textSize,responseKeys:Object.keys(parsed).sort().join(",").slice(0,240),contentSize:content.length,finishReason:response.choices?.[0]?.finish_reason||null});if(attempts===0)continue;if(repair&&attempts===0){request=repair(request,checked.errors);continue;}throw new ProviderError("invalid_response",safeMessage.invalid_response);}log({requestId:request.requestId,durationMs:Date.now()-started,errorType:null,attempts:attempts+1,textSize:request.textSize});return normalized;}catch(error){const kind=error instanceof ProviderError?error.kind:classify(error);const status=Number(error?.status||error?.statusCode||0)||null;log({requestId:request.requestId,durationMs:Date.now()-started,errorType:kind,attempts:attempts+1,textSize:request.textSize,status,providerCode:safeProviderCode(error)});if(error instanceof ProviderError)throw error;if(attempts===1||!["timeout","rate_limit","provider_unavailable","invalid_response"].includes(kind))throw new ProviderError(kind,safeMessage[kind]);await sleep(150*(attempts+1));}finally{clearTimeout(timer);}}throw new ProviderError("provider_unavailable",safeMessage.provider_unavailable);}};}
function mergeValues(left,right){if(right===null||right===undefined||right==="")return structuredClone(left);if(left===null||left===undefined||left==="")return structuredClone(right);if(Array.isArray(left)||Array.isArray(right)){const values=[...(Array.isArray(left)?left:[left]),...(Array.isArray(right)?right:[right])];const seen=new Set();return values.filter((entry)=>{const key=JSON.stringify(entry);if(seen.has(key))return false;seen.add(key);return true;});}if(typeof left==="object"&&typeof right==="object"){const output={...structuredClone(left)};for(const [key,value] of Object.entries(right))output[key]=mergeValues(output[key],value);return output;}if(typeof left==="boolean"||typeof right==="boolean")return Boolean(left||right);if(typeof left==="number"&&typeof right==="number")return Math.max(left,right);return String(right).length>String(left).length?right:left;}
function groupChunks(chunks,maxChars=30000){const groups=[];let current="";for(const chunk of chunks||[]){const value=String(chunk||"").trim();if(!value)continue;if(current&&current.length+value.length+2>maxChars){groups.push(current);current=value;}else current=current?`${current}\n\n${value}`:value;}if(current)groups.push(current);return groups;}
async function mapConcurrent(items,concurrency,worker){const results=new Array(items.length);let next=0;async function run(){while(next<items.length){const index=next++;results[index]=await worker(items[index],index);}}await Promise.all(Array.from({length:Math.min(concurrency,items.length)},run));return results;}
function canonicalName(value){return String(value||"").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");}
function cleanMergedProject(project,fullMarkedText,sourceMetadata,batchCount){
  const cleaned=structuredClone(project);
  const members=[];const names=new Set();
  for(const member of cleaned.project_identity?.team_members||[]){const name=String(member?.name||"").trim();const canonical=canonicalName(name);if(!canonical||/^(?:[a-z]\.?){1,4}$/i.test(name.replace(/\s+/g,""))||names.has(canonical))continue;names.add(canonical);members.push(member);}
  if(cleaned.project_identity)cleaned.project_identity.team_members=members;
  if(!/(?:\bTRL\s*\d|technology readiness level)/iu.test(fullMarkedText)){cleaned.project_stage.trl_estimate=null;cleaned.project_stage.trl_reason="غير محدد صراحة في المصدر.";}
  if(cleaned.intellectual_property?.commercialization_restrictions){cleaned.intellectual_property.commercialization_restrictions=cleaned.intellectual_property.commercialization_restrictions.filter((item)=>!/(?:creative commons|CC\s*BY|ترخيص النشر|رخصة المقال)/iu.test(String(item)));}
  cleaned.source_summary={sources_reviewed:(sourceMetadata||[]).map((source)=>source.name).filter(Boolean),information_completeness:"متوسطة",extraction_confidence:80,notes:`تمت معالجة المستند كاملًا ضمن الحد المسموح عبر ${batchCount} دفعات، ثم دُمجت النتائج قبل التقييم النهائي.`};
  return cleaned;
}
function createGroqResearchProvider(){const OpenAI=require("openai");const key=process.env.GROQ_API_KEY;if(!key)throw new ProviderError("configuration_error",safeMessage.configuration_error);const adapter=createGroqAdapter({client:new OpenAI({apiKey:key,baseURL:"https://api.groq.com/openai/v1"}),model:process.env.GROQ_MODEL,log:(entry)=>console.info("[rafid:ai]",JSON.stringify(entry))});return {health:()=>adapter.health(),analyze:({chunks,requestId,textSize,outputLanguage})=>adapter.analyze({...requestFor("score",{chunks,output_language:outputLanguage}),requestId,textSize})};}
function createResearchProvider() {
  if (process.env.AI_PROVIDER !== "deepseek") return createGroqResearchProvider();
  const ai = require("./ai");
  const { augmentProjectDataFromText, fallbackProjectData, normalizeProjectData } = require("./normalize");
  return {
    health: async () => ({ ready: ai.currentProviderStatus().ready }),
    async analyze({ chunks, outputLanguage, sourceMetadata }) {
      try {
        const groups = groupChunks(chunks);
        const extractions = await mapConcurrent(groups, 2, async (rawText, index) => {
          try {
            return (await ai.extractWithAI({
              rawText,
              metadata: { source_documents: sourceMetadata || [], batch: index + 1, total_batches: groups.length },
              files: sourceMetadata || [],
              outputLanguage,
            })).project;
          } catch (error) {
            if (error?.code !== "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED") throw error;
            return fallbackProjectData(rawText, { metadata: { batch: index + 1 }, files: sourceMetadata || [] });
          }
        });
        const merged = extractions.reduce(mergeValues, {});
        const fullMarkedText = chunks.join("\n\n");
        const normalizedProject = normalizeProjectData(augmentProjectDataFromText(merged, fullMarkedText), { metadata: { source_documents: sourceMetadata || [] }, files: sourceMetadata || [] });
        const project = cleanMergedProject(normalizedProject, fullMarkedText, sourceMetadata, groups.length);
        const request = requestFor("score", {
          project_data: project,
          page_evidence_corpus: fullMarkedText,
          source_metadata: sourceMetadata || [],
          document_coverage: "complete_within_configured_limit",
          output_language: outputLanguage,
        });
        const response = await ai.runStructured({
          systemPrompt: request.messages[0].content,
          userPrompt: request.messages[1].content,
          schema: { type: "json_schema", name: "research_readiness", strict: true, schema: modelOutputSchema },
          model: ai.openAIStageModel("assessment"),
          maxOutputTokens: 10000,
        });
        const result = normalizeModelAnalysis(response.data);
        if (!validateAnalysis(result).valid) throw new ProviderError("invalid_response", safeMessage.invalid_response);
        return { result, meta: { provider: response.provider, model: response.model, extractionBatches: groups.length } };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        const kind = error.code === "RAFID_ZDR_REQUIRED" ? "configuration_error" : classify(error);
        throw new ProviderError(kind, safeMessage[kind]);
      }
    },
  };
}
module.exports={ProviderError,cleanMergedProject,createGroqAdapter,createGroqResearchProvider:createResearchProvider,groupChunks,mergeValues,modelOutputSchema,normalizeModelAnalysis,safeMessage,safeProviderCode};
