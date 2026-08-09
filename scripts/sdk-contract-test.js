"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { runStructured, resetAIClient } = require("../src/lib/ai");

const schema = {
  type: "json_schema",
  name: "rafid_sdk_contract",
  strict: true,
  schema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
};

async function withFakeServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function testResponsesContract() {
  let captured;
  await withFakeServer(async (request, response) => {
    captured = { url: request.url, body: await readBody(request) };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      id: "resp_test",
      object: "response",
      status: "completed",
      model: "gpt-5.6",
      output: [{
        id: "msg_test",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "{\"ok\":true}", annotations: [] }],
      }],
      usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
    }));
  }, async (baseURL) => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key-not-real";
    process.env.OPENAI_BASE_URL = baseURL;
    process.env.OPENAI_MODEL = "gpt-5.6";
    process.env.RAFID_DATA_POLICY = "standard";
    process.env.RAFID_REASONING_EFFORT = "high";
    resetAIClient();
    const result = await runStructured({
      systemPrompt: "System",
      userPrompt: "User",
      schema,
      privacy: { classification: "internal" },
      maxOutputTokens: 200,
    });
    assert.deepEqual(result.data, { ok: true });
  });
  assert.equal(captured.url, "/v1/responses");
  assert.equal(captured.body.store, false);
  assert.equal(captured.body.reasoning.effort, "high");
  assert.equal(captured.body.text.format.type, "json_schema");
  assert.equal(captured.body.text.format.strict, true);
}

async function testOllamaContract() {
  let captured;
  await withFakeServer(async (request, response) => {
    captured = { url: request.url, body: await readBody(request) };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      id: "chatcmpl_test",
      object: "chat.completion",
      model: "gpt-oss:20b",
      choices: [{ index: 0, message: { role: "assistant", content: "{\"ok\":true}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }));
  }, async (baseURL) => {
    process.env.AI_PROVIDER = "ollama";
    process.env.OLLAMA_BASE_URL = baseURL;
    process.env.OLLAMA_MODEL = "gpt-oss:20b";
    resetAIClient();
    const result = await runStructured({
      systemPrompt: "System",
      userPrompt: "User",
      schema,
      privacy: { classification: "internal" },
      maxOutputTokens: 200,
    });
    assert.deepEqual(result.data, { ok: true });
    assert.equal(result.dataPolicy.provider_retention, "no_external_transfer");
  });
  assert.equal(captured.url, "/v1/chat/completions");
  assert.equal(captured.body.reasoning_effort, "high");
  assert.equal(captured.body.temperature, 0);
  assert.equal(captured.body.response_format.type, "json_schema");
  assert.equal(captured.body.response_format.json_schema.strict, true);
}

async function testGroqContract() {
  const captured = [];
  await withFakeServer(async (request, response) => {
    captured.push({
      url: request.url,
      authorization: request.headers.authorization,
      body: await readBody(request),
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      id: "chatcmpl_groq_test",
      object: "chat.completion",
      model: "openai/gpt-oss-120b",
      choices: [{ index: 0, message: { role: "assistant", content: "{\"ok\":true}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }));
  }, async (baseURL) => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-groq-key-not-real";
    process.env.GROQ_BASE_URL = baseURL;
    process.env.GROQ_MODEL = "openai/gpt-oss-120b";
    process.env.GROQ_ZERO_DATA_RETENTION_CONFIRMED = "true";
    process.env.GROQ_REASONING_EFFORT = "low";
    process.env.GROQ_ASSESSMENT_REASONING_EFFORT = "medium";
    process.env.GROQ_MAX_OUTPUT_TOKENS = "1600";
    process.env.RAFID_DATA_POLICY = "strict_zdr";
    process.env.RAFID_TEST_MODE = "true";
    resetAIClient();
    const result = await runStructured({
      systemPrompt: "System",
      userPrompt: "User",
      schema,
      privacy: { classification: "internal" },
      maxOutputTokens: 2000,
    });
    assert.deepEqual(result.data, { ok: true });
    assert.equal(result.dataPolicy.zero_data_retention_confirmed, true);
    assert.equal(result.dataPolicy.usage_metadata_retained, true);
    const objectResult = await runStructured({
      systemPrompt: "System",
      userPrompt: "User",
      schema,
      privacy: { classification: "internal" },
      maxOutputTokens: 1200,
      responseMode: "json_object",
      reasoningEffort: "medium",
    });
    assert.deepEqual(objectResult.data, { ok: true });
  });
  assert.equal(captured[0].url, "/v1/chat/completions");
  assert.equal(captured[0].authorization, "Bearer test-groq-key-not-real");
  assert.equal(captured[0].body.reasoning_effort, "low");
  assert.equal(captured[0].body.reasoning_format, "hidden");
  assert.equal(captured[0].body.max_completion_tokens, 1600);
  assert.equal(captured[0].body.max_tokens, undefined);
  assert.equal(captured[0].body.response_format.type, "json_schema");
  assert.equal(captured[0].body.response_format.json_schema.strict, true);
  assert.equal(captured[1].body.response_format.type, "json_object");
  assert.equal(captured[1].body.reasoning_effort, "medium");
  assert.match(captured[1].body.messages[1].content, /أعد كائن JSON فقط/);
}

Promise.resolve()
  .then(testResponsesContract)
  .then(testOllamaContract)
  .then(testGroqContract)
  .then(() => console.log("Rafid OpenAI/Ollama/Groq SDK contract tests passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
