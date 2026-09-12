"use strict";

const assert = require("node:assert/strict");

async function main() {
  const worker = await import("../cloudflare/worker.mjs");
  assert.equal(worker.isBackendRoute("/health"), true);
  assert.equal(worker.isBackendRoute("/api/rafid/public/config"), true);
  assert.equal(worker.isBackendRoute("/not-api"), false);
  assert.equal(worker.apiOrigin("https://rafid-v4.onrender.com/path"), "https://rafid-v4.onrender.com");
  assert.throws(() => worker.apiOrigin("http://insecure.example"), /HTTPS/);

  let assetRequests = 0;
  let upstreamRequest;
  const env = {
    RAFID_API_ORIGIN: "https://rafid-v4.onrender.com",
    ASSETS: {
      fetch(request) {
        assetRequests += 1;
        return new Response(`asset:${new URL(request.url).pathname}`, { status: 200 });
      },
    },
  };
  const originalFetch = global.fetch;
  global.fetch = async (request) => {
    upstreamRequest = request;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", Server: "hidden-upstream" },
    });
  };

  try {
    const asset = await worker.default.fetch(new Request("https://rafid.example/rafid-v4.css"), env);
    assert.equal(await asset.text(), "asset:/rafid-v4.css");
    assert.equal(assetRequests, 1);

    const api = await worker.default.fetch(
      new Request("https://rafid.example/api/rafid/public/config", {
        headers: {
          "cf-connecting-ip": "203.0.113.10",
          "x-forwarded-for": "198.51.100.22",
        },
      }),
      env,
    );
    assert.equal(api.status, 200);
    assert.equal(new URL(upstreamRequest.url).origin, "https://rafid-v4.onrender.com");
    assert.equal(new URL(upstreamRequest.url).pathname, "/api/rafid/public/config");
    assert.equal(upstreamRequest.headers.get("x-rafid-edge"), "cloudflare");
    assert.equal(upstreamRequest.headers.get("x-forwarded-for"), "203.0.113.10");
    assert.equal(api.headers.get("cache-control"), "no-store");
    assert.equal(api.headers.get("server"), null);

    const rejected = await worker.default.fetch(new Request("https://rafid.example/api/rafid/test", { method: "PUT" }), env);
    assert.equal(rejected.status, 405);

    const posted = await worker.default.fetch(
      new Request("https://rafid.example/api/rafid/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.11" },
        body: JSON.stringify({ text: "safe synthetic input" }),
        duplex: "half",
      }),
      env,
    );
    assert.equal(posted.status, 200);
    assert.deepEqual(await upstreamRequest.json(), { text: "safe synthetic input" });
    assert.equal(upstreamRequest.headers.get("x-forwarded-for"), "203.0.113.11");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("Rafid Cloudflare edge frontend tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
