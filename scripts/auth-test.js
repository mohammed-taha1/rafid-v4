"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url !== "/auth/v1/user") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization === "Bearer valid-session-token") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: "user-123", email: "user@example.test" }));
      return;
    }
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "invalid" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  process.env.RAFID_TEST_MODE = "true";
  process.env.RAFID_AUTH_REQUIRED = "true";
  process.env.RAFID_PROVIDER_CONFIGURATION_MODE = "server";
  process.env.RAFID_DEPLOYMENT_MODE = "shared";
  process.env.RAFID_AUTH_PROVIDERS = "google,azure,github,email,unknown";
  process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_ANON_KEY = "test-supabase-anon-key-not-secret-123456";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-never-public";
  process.env.RATE_LIMIT_REQUESTS = "2";
  process.env.RAFID_GLOBAL_DAILY_AI_LIMIT = "3";

  const {
    authorizeHeaders,
    providerConfigurationMode,
    publicRuntimeConfig,
  } = require("../src/lib/auth");
  const { checkRateLimit } = require("../src/lib/http");

  try {
    const missing = await authorizeHeaders({});
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "RAFID_LOGIN_REQUIRED");

    const invalid = await authorizeHeaders({ Authorization: "Bearer invalid-session-token" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.statusCode, 401);

    const valid = await authorizeHeaders({ Authorization: "Bearer valid-session-token" });
    assert.equal(valid.ok, true);
    assert.equal(valid.user.id, "user-123");
    assert.equal(valid.user.email, "user@example.test");
    assert.equal(providerConfigurationMode(), "server");

    const config = publicRuntimeConfig();
    assert.equal(config.auth.enabled, true);
    assert.equal(config.auth.required, true);
    assert.equal(config.auth.persist_session, true);
    assert.deepEqual(config.auth.sign_in_providers, ["google", "azure", "github", "email"]);
    assert.equal(config.workspace_sync.enabled, true);
    assert.equal(config.workspace_sync.mode, "user_jwt_rls");
    assert.ok(config.workspace_sync.tables.includes("rafid_organizations"));
    assert.equal(config.workspace_sync.service_role_exposed, false);
    assert.equal(config.workspace_sync.raw_content_persisted, false);
    assert.equal(config.provider_configuration_mode, "server");
    assert.equal(Object.prototype.hasOwnProperty.call(config, "GROQ_API_KEY"), false);
    assert.equal(JSON.stringify(config).includes(process.env.SUPABASE_SERVICE_ROLE_KEY), false);
    assert.equal(JSON.stringify(config).includes("SUPABASE_SERVICE_ROLE_KEY"), false);

    const request = { headers: { "x-forwarded-for": "203.0.113.7" } };
    assert.equal(checkRateLimit(request, valid).ok, true);
    assert.equal(checkRateLimit(request, valid).ok, true);
    const limited = checkRateLimit(request, valid);
    assert.equal(limited.ok, false);
    assert.equal(limited.scope, "user");

    console.log("Rafid Supabase auth, non-persistent MVP workspace config, and per-user limits passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
