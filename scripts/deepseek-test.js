"use strict";
const assert = require("node:assert/strict");
const captured = [];
// Intercept SDK transport. No external request or real credentials.
global.fetch = async (url, options) => {
  captured.push({ url: String(url), body: JSON.parse(options.body) });
  return new Response(JSON.stringify({ id: "test", object: "response", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"ok":true}', annotations: [] }] }] }), { headers: { "content-type": "application/json" } });
};
process.env.AI_PROVIDER = "deepseek";
process.env.DEEPSEEK_API_KEY = "test-not-real";
process.env.RAFID_DATA_POLICY = "standard";
const ai = require("../src/lib/ai");
async function main() {
  const schema = { type: "json_schema", name: "contract", strict: true, schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } };
  for (const stage of ["extraction", "opportunity", "assessment"]) {
    assert.equal(ai.openAIStageModel(stage), "deepseek-v4-pro");
    const result = await ai.runStructured({ systemPrompt: "Return JSON", userPrompt: "Test", schema, model: ai.openAIStageModel(stage) });
    assert.deepEqual(result.data, { ok: true });
    assert.equal(result.provider, "deepseek");
  }
  assert.ok(captured.every(({ url, body }) => url === "https://api.deepseek.com/responses" && body.store === false && body.text.format.type === "json_schema"));
  assert.deepEqual(ai.parseStructuredOutputText('```json\n{"ok":true}\n```'), { ok: true });
  assert.deepEqual(ai.parseStructuredOutputText('Result:\n{"ok":true}\nDone.'), { ok: true });
  assert.deepEqual(ai.parseStructuredOutputText('{"message":"brace } inside string","ok":true}'), { message: "brace } inside string", ok: true });
  process.env.DEEPSEEK_EXTRACTION_MODEL = "deepseek-flash";
  assert.equal(ai.openAIStageModel("extraction"), "deepseek-flash");
  assert.throws(() => ai.deepSeekModel("other"));
  process.env.RAFID_DATA_POLICY = "strict_zdr";
  await assert.rejects(ai.runStructured({ schema }), { code: "RAFID_ZDR_REQUIRED" });
  assert.equal(captured.length, 3);
  process.env.DEEPSEEK_BASE_URL = "https://example.com";
  assert.equal(ai.currentProviderStatus().configured, false);
  console.log("DeepSeek routing, SDK transport, schema and privacy tests passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
