"use strict";

const GROQ_MODELS = new Set(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
const PLACEHOLDER_PATTERN = /^(?:replace[_-]with|change[_-]me|your[_-]|example|placeholder|dummy)/i;

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function firstEnvironmentValue(names, fallback = "") {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return fallback;
}

function isPlaceholder(value) {
  return !value || PLACEHOLDER_PATTERN.test(String(value).trim());
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function appEnvironment() {
  const name = firstEnvironmentValue(["APP_NAME"], "Rafid");
  const url = firstEnvironmentValue(["APP_URL"]);
  let validUrl = !url;
  if (url) {
    try {
      const parsed = new URL(url);
      validUrl = ["http:", "https:"].includes(parsed.protocol);
    } catch {
      validUrl = false;
    }
  }
  return { name, url, validUrl };
}

function maxFileSizeMb() {
  return boundedInteger(process.env.MAX_FILE_SIZE_MB, 20, 1, 100);
}

function analysisTimeoutMs() {
  return boundedInteger(process.env.ANALYSIS_TIMEOUT_SECONDS, 60, 5, 300) * 1000;
}

function rateLimitEnvironment(required = false) {
  const requests = boundedInteger(
    firstEnvironmentValue(["RATE_LIMIT_REQUESTS", "RAFID_RATE_LIMIT_REQUESTS"]),
    required ? 12 : 80,
    1,
    10_000,
  );
  const minutesValue = firstEnvironmentValue(["RATE_LIMIT_WINDOW_MINUTES"]);
  const windowSeconds = minutesValue
    ? boundedInteger(minutesValue, 10, 1, 1_440) * 60
    : boundedInteger(process.env.RAFID_RATE_LIMIT_WINDOW_SECONDS, 600, 60, 86_400);
  return { requests, windowSeconds };
}

function supabaseEnvironment() {
  const url = firstEnvironmentValue(["SUPABASE_URL"]).replace(/\/$/, "");
  const anonKey = firstEnvironmentValue(["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]);
  const serviceRoleKey = firstEnvironmentValue(["SUPABASE_SERVICE_ROLE_KEY"]);
  let validUrl;
  try {
    const parsed = new URL(url);
    validUrl = parsed.protocol === "https:";
    if (
      envFlag("RAFID_TEST_MODE") &&
      parsed.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname.toLowerCase())
    ) {
      validUrl = true;
    }
  } catch {
    validUrl = false;
  }
  return {
    url,
    anonKey,
    configured: Boolean(validUrl && anonKey.length >= 20 && !isPlaceholder(anonKey)),
    validUrl,
    serviceRoleConfigured: Boolean(serviceRoleKey && !isPlaceholder(serviceRoleKey)),
  };
}

function inspectPositiveInteger(issues, name, { minimum, maximum, aliases = [] }) {
  const selectedName = [name, ...aliases].find((candidate) => {
    const value = process.env[candidate];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
  if (!selectedName) return;
  const value = String(process.env[selectedName]).trim();
  const parsed = Number.parseInt(value, 10);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push({
      severity: "error",
      code: "INVALID_POSITIVE_INTEGER",
      variables: [selectedName],
      message: `Expected an integer between ${minimum} and ${maximum}.`,
    });
  }
}

function inspectEnvironment() {
  const issues = [];
  const app = appEnvironment();
  const supabase = supabaseEnvironment();
  const authRequired = envFlag("RAFID_AUTH_REQUIRED", false);
  const providerMode = firstEnvironmentValue(
    ["RAFID_PROVIDER_CONFIGURATION_MODE"],
    "local_session",
  ).toLowerCase();
  const provider = firstEnvironmentValue(["AI_PROVIDER"], "openai").toLowerCase();
  const dataPolicy = firstEnvironmentValue(["RAFID_DATA_POLICY"], "strict_zdr").toLowerCase();
  const deploymentMode = firstEnvironmentValue(["RAFID_DEPLOYMENT_MODE"], "local").toLowerCase();

  if (!app.validUrl) {
    issues.push({
      severity: "error",
      code: "APP_URL_INVALID",
      variables: ["APP_URL"],
      message: "APP_URL must be an absolute HTTP or HTTPS URL.",
    });
  } else if (deploymentMode === "shared" && !app.url) {
    issues.push({
      severity: "warning",
      code: "APP_URL_MISSING",
      variables: ["APP_URL"],
      message: "Set APP_URL to the public application origin for shared deployments.",
    });
  }

  inspectPositiveInteger(issues, "MAX_FILE_SIZE_MB", { minimum: 1, maximum: 100 });
  inspectPositiveInteger(issues, "ANALYSIS_TIMEOUT_SECONDS", { minimum: 5, maximum: 300 });
  inspectPositiveInteger(issues, "RATE_LIMIT_REQUESTS", {
    minimum: 1,
    maximum: 10_000,
    aliases: ["RAFID_RATE_LIMIT_REQUESTS"],
  });
  inspectPositiveInteger(issues, "RATE_LIMIT_WINDOW_MINUTES", { minimum: 1, maximum: 1_440 });

  if (authRequired && !supabase.validUrl) {
    issues.push({
      severity: "error",
      code: "SUPABASE_URL_INVALID",
      variables: ["SUPABASE_URL"],
      message: "Supabase authentication requires a valid HTTPS URL.",
    });
  }
  if (
    authRequired &&
    (!supabase.anonKey || isPlaceholder(supabase.anonKey) || supabase.anonKey.length < 20)
  ) {
    issues.push({
      severity: "error",
      code: "SUPABASE_ANON_KEY_MISSING",
      variables: ["SUPABASE_ANON_KEY"],
      message: "Supabase authentication requires the browser-safe anonymous key.",
    });
  }
  if (supabase.serviceRoleConfigured && !envFlag("RAFID_PRODUCT_TELEMETRY_ENABLED", true)) {
    issues.push({
      severity: "warning",
      code: "SUPABASE_SERVICE_ROLE_KEY_UNUSED",
      variables: ["SUPABASE_SERVICE_ROLE_KEY"],
      message: "Product telemetry is disabled, so the service-role key is unused; remove it or keep it server-only.",
    });
  }
  if (envFlag("RAFID_PRODUCT_TELEMETRY_ENABLED", true) && supabase.configured && !supabase.serviceRoleConfigured) {
    issues.push({ severity: "warning", code: "RAFID_TELEMETRY_DISABLED", variables: ["SUPABASE_SERVICE_ROLE_KEY"], message: "The operations dashboard needs a server-only service-role key to persist content-free events." });
  }

  if (deploymentMode === "shared" && !authRequired) {
    issues.push({
      severity: "warning",
      code: "SHARED_AUTH_DISABLED",
      variables: ["RAFID_AUTH_REQUIRED"],
      message: "Authentication should be required for shared deployments.",
    });
  }
  if (!["strict_zdr", "standard"].includes(dataPolicy)) {
    issues.push({
      severity: "error",
      code: "DATA_POLICY_INVALID",
      variables: ["RAFID_DATA_POLICY"],
      message: "RAFID_DATA_POLICY must be strict_zdr or standard.",
    });
  }
  if (
    deploymentMode === "shared" &&
    firstEnvironmentValue(["RAFID_ALLOWED_ORIGINS"], "*") === "*"
  ) {
    issues.push({
      severity: "warning",
      code: "SHARED_CORS_WILDCARD",
      variables: ["RAFID_ALLOWED_ORIGINS"],
      message: "Use an explicit origin allowlist for shared deployments.",
    });
  }

  if (providerMode === "server") {
    if (!["groq", "openai", "azure_openai", "ollama"].includes(provider)) {
      issues.push({
        severity: "error",
        code: "AI_PROVIDER_UNSUPPORTED",
        variables: ["AI_PROVIDER"],
        message: "AI_PROVIDER is not supported by this server.",
      });
    }
    if (provider === "groq") {
      const key = firstEnvironmentValue(["GROQ_API_KEY"]);
      const model = firstEnvironmentValue(["GROQ_MODEL"], "openai/gpt-oss-120b");
      if (isPlaceholder(key)) {
        issues.push({
          severity: "error",
          code: "GROQ_API_KEY_MISSING",
          variables: ["GROQ_API_KEY"],
          message: "The server-managed Groq provider requires a secret API key.",
        });
      }
      if (!GROQ_MODELS.has(model)) {
        issues.push({
          severity: "error",
          code: "GROQ_MODEL_UNSUPPORTED",
          variables: ["GROQ_MODEL"],
          message: "GROQ_MODEL is not in the supported server allowlist.",
        });
      }
      if (
        dataPolicy === "strict_zdr" &&
        !envFlag("GROQ_ZERO_DATA_RETENTION_CONFIRMED", false)
      ) {
        issues.push({
          severity: "error",
          code: "GROQ_ZDR_NOT_CONFIRMED",
          variables: ["GROQ_ZERO_DATA_RETENTION_CONFIRMED"],
          message: "Strict data processing requires confirmed Groq Zero Data Retention.",
        });
      }
    } else if (provider === "openai") {
      if (isPlaceholder(firstEnvironmentValue(["OPENAI_API_KEY"]))) {
        issues.push({
          severity: "error",
          code: "OPENAI_API_KEY_MISSING",
          variables: ["OPENAI_API_KEY"],
          message: "The server-managed OpenAI provider requires a secret API key.",
        });
      }
      if (
        dataPolicy === "strict_zdr" &&
        !envFlag("OPENAI_ZERO_DATA_RETENTION_CONFIRMED", false)
      ) {
        issues.push({
          severity: "error",
          code: "OPENAI_ZDR_NOT_CONFIRMED",
          variables: ["OPENAI_ZERO_DATA_RETENTION_CONFIRMED"],
          message: "Strict data processing requires confirmed OpenAI Zero Data Retention.",
        });
      }
    } else if (
      provider === "azure_openai" &&
      ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT"].some(
        (name) => isPlaceholder(firstEnvironmentValue([name])),
      )
    ) {
      issues.push({
        severity: "error",
        code: "AZURE_OPENAI_CONFIGURATION_MISSING",
        variables: [
          "AZURE_OPENAI_API_KEY",
          "AZURE_OPENAI_ENDPOINT",
          "AZURE_OPENAI_DEPLOYMENT",
        ],
        message: "The server-managed Azure OpenAI provider configuration is incomplete.",
      });
    } else if (
      provider === "azure_openai" &&
      dataPolicy === "strict_zdr" &&
      !envFlag("AZURE_ZERO_DATA_RETENTION_CONFIRMED", false)
    ) {
      issues.push({
        severity: "error",
        code: "AZURE_ZDR_NOT_CONFIRMED",
        variables: ["AZURE_ZERO_DATA_RETENTION_CONFIRMED"],
        message: "Strict data processing requires confirmed Azure OpenAI Zero Data Retention.",
      });
    }
  }

  const analysisErrors = new Set([
    "ANALYSIS_TIMEOUT_SECONDS",
    "AI_PROVIDER",
    "RAFID_DATA_POLICY",
    "GROQ_API_KEY",
    "GROQ_MODEL",
    "GROQ_ZERO_DATA_RETENTION_CONFIRMED",
    "OPENAI_API_KEY",
    "OPENAI_ZERO_DATA_RETENTION_CONFIRMED",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT",
    "AZURE_ZERO_DATA_RETENTION_CONFIRMED",
  ]);
  return {
    issues,
    publicPagesReady: true,
    authReady: !authRequired || supabase.configured,
    analysisReady:
      providerMode !== "server" ||
      !issues.some(
        (issue) =>
          issue.severity === "error" && issue.variables.some((name) => analysisErrors.has(name)),
      ),
  };
}

function publicEnvironment() {
  const app = appEnvironment();
  const report = inspectEnvironment();
  return {
    app: { name: app.name, url: app.url || null },
    limits: { max_file_size_mb: maxFileSizeMb() },
    services: {
      public_pages_ready: report.publicPagesReady,
      auth_ready: report.authReady,
      analysis_ready: report.analysisReady,
    },
  };
}

function logEnvironmentIssues(report = inspectEnvironment(), logger = console) {
  for (const issue of report.issues) {
    const method = issue.severity === "error" ? "error" : "warn";
    logger[method](
      `[rafid:config:${issue.code}] ${issue.message} Variables: ${issue.variables.join(", ")}.`,
    );
  }
  return report;
}

module.exports = {
  analysisTimeoutMs,
  appEnvironment,
  envFlag,
  inspectEnvironment,
  logEnvironmentIssues,
  maxFileSizeMb,
  publicEnvironment,
  rateLimitEnvironment,
  supabaseEnvironment,
};
