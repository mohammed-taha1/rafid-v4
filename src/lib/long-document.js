"use strict";
const crypto=require("node:crypto");
function normalizeDocument(value){return String(value||"").replace(/\r\n?/g,"\n").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();}
function chunkDocument(value,{maxChars=12000,overlap=600,maxTotalChars=120000}={}){const text=normalizeDocument(value);const accepted=text.slice(0,maxTotalChars);const rough=accepted.split(/(?=^#{1,6}\s|^.{1,80}[:：]\s*$|\f)/m);const pieces=rough.flatMap(p=>p.length<=maxChars?[p]:p.split(/(?<=[.!؟])\s+/).flatMap(s=>s.length<=maxChars?[s]:s.match(new RegExp(`[\\s\\S]{1,${maxChars}}(?:\\s|$)`,"g"))||[s]));const chunks=[];let current="";for(const piece of pieces){if((current+piece).length>maxChars&&current){chunks.push(current.trim());current=current.slice(-overlap)+"\n"+piece;}else current+=piece;}if(current.trim())chunks.push(current.trim());return {chunks:[...new Set(chunks)],truncated:text.length>maxTotalChars,estimatedTokens:Math.ceil(accepted.length/4)};}
function chunkId(text){return crypto.createHash("sha256").update(text).digest("hex").slice(0,16);}
function dedupeExtractions(items){const seen=new Set();return items.filter(item=>{const key=chunkId(JSON.stringify(item));if(seen.has(key))return false;seen.add(key);return true;});}
module.exports={normalizeDocument,chunkDocument,chunkId,dedupeExtractions};
