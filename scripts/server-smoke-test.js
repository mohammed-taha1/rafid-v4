"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

async function main() {
  const port = 18080;
  const child = spawn(process.execPath, [path.join(__dirname, "run-rafid.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "",
      GROQ_API_KEY: "",
      AZURE_OPENAI_API_KEY: "",
      RAFID_ACCESS_TOKEN: "",
      RAFID_AUTH_REQUIRED: "false",
      RAFID_PROVIDER_CONFIGURATION_MODE: "local_session",
      RAFID_DEPLOYMENT_MODE: "local",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Frontend server did not start. ${output}`)), 5000);
    const inspect = (chunk) => {
      output += chunk.toString();
      if (output.includes("Rafid automatic:")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => reject(new Error(`Frontend server exited early with ${code}. ${output}`)));
  });

  try {
    await ready;
    const index = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type") || "", /text\/html/);
    assert.match(await index.text(), /جاهزية الفرصة التمويلية/);
    assert.match(index.headers.get("content-security-policy") || "", /default-src 'self'/);

    const publicConfig = await fetch(`http://127.0.0.1:${port}/api/rafid/public/config`);
    assert.equal(publicConfig.status, 200);
    const runtime = await publicConfig.json();
    assert.equal(runtime.auth.required, false);
    assert.equal(runtime.provider_configuration_mode, "local_session");

    const health = await fetch(`http://127.0.0.1:${port}/api/rafid/health`);
    assert.equal(health.status, 503);
    const initialStatus = await health.json();
    assert.equal(initialStatus.ok, false);
    assert.equal(initialStatus.ready, false);
    assert.equal(initialStatus.raw_content_persistence, false);

    const configure = await fetch(`http://127.0.0.1:${port}/api/rafid/local/configure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        api_key: "sk-test-key-not-real",
        model: "gpt-5.6",
        data_policy: "standard",
        zero_data_retention_confirmed: false,
      }),
    });
    assert.equal(configure.status, 200);
    const configured = await configure.json();
    assert.equal(configured.key_persisted, false);
    assert.equal(configured.provider.data_policy.store, false);

    const privateFetch = await fetch(`http://127.0.0.1:${port}/api/rafid/source/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://127.0.0.1/private" }),
    });
    assert.equal(privateFetch.status, 400);

    const pdf = await fetch(`http://127.0.0.1:${port}/vendor/pdf.min.mjs`);
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get("content-type") || "", /javascript/);
    assert.equal(pdf.headers.get("x-content-type-options"), "nosniff");

    const missing = await fetch(`http://127.0.0.1:${port}/does-not-exist`);
    assert.equal(missing.status, 404);
    console.log("Rafid unified local server smoke test passed.");
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
