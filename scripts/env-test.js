"use strict";

const assert = require("node:assert/strict");

const managedNames = [
  "AI_PROVIDER",
  "ANALYSIS_TIMEOUT_SECONDS",
  "APP_NAME",
  "APP_URL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "GROQ_ZERO_DATA_RETENTION_CONFIRMED",
  "MAX_FILE_SIZE_MB",
  "RAFID_ALLOWED_ORIGINS",
  "RAFID_AUTH_REQUIRED",
  "RAFID_DEPLOYMENT_MODE",
  "RAFID_PROVIDER_CONFIGURATION_MODE",
  "RATE_LIMIT_REQUESTS",
  "RATE_LIMIT_WINDOW_MINUTES",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
];

const original = Object.fromEntries(managedNames.map((name) => [name, process.env[name]]));

function clearManagedEnvironment() {
  for (const name of managedNames) delete process.env[name];
}

function restoreEnvironment() {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function main() {
  clearManagedEnvironment();
  process.env.RAFID_DEPLOYMENT_MODE = "shared";
  process.env.RAFID_PROVIDER_CONFIGURATION_MODE = "server";
  process.env.RAFID_AUTH_REQUIRED = "true";
  process.env.AI_PROVIDER = "groq";
  process.env.APP_URL = "https://rafid.example";
  process.env.GROQ_MODEL = "openai/gpt-oss-120b";

  const {
    analysisTimeoutMs,
    inspectEnvironment,
    maxFileSizeMb,
    publicEnvironment,
    rateLimitEnvironment,
  } = require("../src/lib/env");

  const missing = inspectEnvironment();
  assert.equal(missing.publicPagesReady, true);
  assert.equal(missing.authReady, false);
  assert.equal(missing.analysisReady, false);
  assert.ok(missing.issues.some((issue) => issue.code === "GROQ_API_KEY_MISSING"));
  assert.ok(missing.issues.some((issue) => issue.code === "SUPABASE_ANON_KEY_MISSING"));
  const { publicRuntimeConfig } = require("../src/lib/auth");
  const missingSupabasePublicConfig = publicRuntimeConfig();
  assert.equal(missingSupabasePublicConfig.auth.required, true);
  assert.equal(missingSupabasePublicConfig.auth.ready, false);
  assert.equal(missingSupabasePublicConfig.services.public_pages_ready, true);

  process.env.GROQ_API_KEY = "unit-groq-key-not-a-real-secret";
  process.env.GROQ_ZERO_DATA_RETENTION_CONFIRMED = "true";
  process.env.SUPABASE_URL = "https://unit-project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "unit-supabase-anon-key-not-a-real-secret";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-service-role-key-never-public";
  process.env.MAX_FILE_SIZE_MB = "25";
  process.env.ANALYSIS_TIMEOUT_SECONDS = "45";
  process.env.RATE_LIMIT_REQUESTS = "15";
  process.env.RATE_LIMIT_WINDOW_MINUTES = "8";
  process.env.RAFID_ALLOWED_ORIGINS = "https://rafid.example";

  const ready = inspectEnvironment();
  assert.equal(ready.publicPagesReady, true);
  assert.equal(ready.authReady, true);
  assert.equal(ready.analysisReady, true);
  assert.equal(maxFileSizeMb(), 25);
  assert.equal(analysisTimeoutMs(), 45_000);
  assert.deepEqual(rateLimitEnvironment(true), { requests: 15, windowSeconds: 480 });

  const publicConfig = publicEnvironment();
  const serialized = JSON.stringify(publicConfig);
  assert.equal(publicConfig.app.name, "Rafid");
  assert.equal(publicConfig.limits.max_file_size_mb, 25);
  assert.equal(serialized.includes(process.env.GROQ_API_KEY), false);
  assert.equal(serialized.includes(process.env.SUPABASE_SERVICE_ROLE_KEY), false);
  assert.equal(serialized.includes("SUPABASE_SERVICE_ROLE_KEY"), false);

  process.env.ANALYSIS_TIMEOUT_SECONDS = "not-a-number";
  const invalid = inspectEnvironment();
  assert.ok(
    invalid.issues.some(
      (issue) =>
        issue.code === "INVALID_POSITIVE_INTEGER" &&
        issue.variables.includes("ANALYSIS_TIMEOUT_SECONDS"),
    ),
  );

  console.log("Rafid environment validation and public secret boundary passed.");
}

try {
  main();
} finally {
  restoreEnvironment();
}
