"use strict";

const { RAFID_EXTRACTION_SCHEMA } = require("./schema");
const { SYSTEM_PROMPT, buildUserPrompt } = require("./prompt");
const { RAFID_OPPORTUNITY_SCHEMA } = require("./opportunity-schema");
const {
  OPPORTUNITY_SYSTEM_PROMPT,
  buildOpportunityPrompt,
} = require("./opportunity-prompt");
const {
  RAFID_ASSESSMENT_SCHEMA,
  RAFID_COMPACT_ASSESSMENT_SCHEMA,
} = require("./assessment-schema");
const {
  ASSESSMENT_SYSTEM_PROMPT,
  buildAssessmentPrompt,
} = require("./assessment-prompt");
const { analysisTimeoutMs, envFlag } = require("./env");

let cachedClient = null;
let cachedConfigKey = null;
let OpenAIClient = null;

function dataPolicyFor(config) {
  if (config.provider === "ollama") {
    return {
      mode: "local_only",
      store: false,
      training_by_default: false,
      zero_data_retention_confirmed: true,
      provider_retention: "no_external_transfer",
    };
  }
  const mode = String(process.env.RAFID_DATA_POLICY || "strict_zdr").toLowerCase();
  const zeroDataRetentionConfirmed =
    config.provider === "openai"
      ? envFlag("OPENAI_ZERO_DATA_RETENTION_CONFIRMED")
      : config.provider === "groq"
        ? envFlag("GROQ_ZERO_DATA_RETENTION_CONFIRMED")
      : config.provider === "azure_openai"
        ? envFlag("AZURE_ZERO_DATA_RETENTION_CONFIRMED")
        : false;

  return {
    mode: ["strict_zdr", "standard"].includes(mode) ? mode : "strict_zdr",
    store: false,
    training_by_default: false,
    zero_data_retention_confirmed: zeroDataRetentionConfirmed,
    provider_retention:
      zeroDataRetentionConfirmed
        ? "zero_data_retention"
        : config.provider === "openai"
          ? "abuse_monitoring_up_to_30_days"
          : config.provider === "groq"
            ? "not_retained_by_default_limited_logs_up_to_30_days"
          : "verify_provider_contract",
    usage_metadata_retained: config.provider === "groq",
  };
}

function assertDataPolicy(config, privacy = {}) {
  const classification = String(privacy.classification || "internal").toLowerCase();
  const policy = dataPolicyFor(config);

  if (classification === "restricted") {
    const error = new Error(
      "المحتوى المقيّد لا يُرسل إلى نموذج سحابي. استخدم معالجة داخلية معتمدة.",
    );
    error.statusCode = 422;
    error.code = "RAFID_RESTRICTED_REMOTE_PROCESSING_BLOCKED";
    throw error;
  }

  if (policy.mode === "strict_zdr" && !policy.zero_data_retention_confirmed) {
    const error = new Error(
      "وضع الخصوصية الصارم مفعّل، لكن Zero Data Retention غير مؤكد لهذا الحساب. فعّل ZDR لدى المزود أو اختر الوضع القياسي بعد قبول احتفاظ سجلات المراقبة المحتمل.",
    );
    error.statusCode = 422;
    error.code = "RAFID_ZDR_REQUIRED";
    throw error;
  }

  if (
    classification === "confidential" &&
    !policy.zero_data_retention_confirmed &&
    !envFlag("RAFID_ALLOW_CONFIDENTIAL_STANDARD_PROCESSING")
  ) {
    const error = new Error(
      "المحتوى السري يحتاج Zero Data Retention مؤكدًا أو موافقة مؤسسية صريحة على المعالجة القياسية.",
    );
    error.statusCode = 422;
    error.code = "RAFID_CONFIDENTIAL_REQUIRES_ZDR";
    throw error;
  }

  return policy;
}

function providerConfig() {
  const provider = String(process.env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "ollama") {
    const baseURL = String(
      process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
    ).replace(/\/$/, "");
    let parsed;
    try {
      parsed = new URL(baseURL);
    } catch {
      parsed = null;
    }
    if (
      !parsed ||
      !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname.toLowerCase())
    ) {
      const error = new Error("عنوان Ollama يجب أن يكون محليًا على هذا الجهاز.");
      error.statusCode = 503;
      error.code = "RAFID_INVALID_LOCAL_PROVIDER_URL";
      throw error;
    }
    return {
      provider,
      apiKey: process.env.OLLAMA_API_KEY || "ollama-local",
      baseURL,
      model: process.env.OLLAMA_MODEL || "gpt-oss:20b",
      apiMode: "chat_completions",
    };
  }
  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    const officialBaseURL = "https://api.groq.com/openai/v1";
    const requestedBaseURL = String(process.env.GROQ_BASE_URL || officialBaseURL).replace(/\/$/, "");
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const supportedModels = new Set(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
    const testOverride = envFlag("RAFID_TEST_MODE") && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/v1$/i.test(requestedBaseURL);
    if (requestedBaseURL !== officialBaseURL && !testOverride) {
      const error = new Error("عنوان Groq ثابت على الواجهة الرسمية لحماية المفتاح من التحويل إلى خادم آخر.");
      error.statusCode = 503;
      error.code = "RAFID_INVALID_GROQ_PROVIDER_URL";
      throw error;
    }
    if (!supportedModels.has(model)) {
      const error = new Error("رافد يدعم على Groq النموذجين openai/gpt-oss-120b وopenai/gpt-oss-20b فقط لضمان JSON Schema الصارم.");
      error.statusCode = 503;
      error.code = "RAFID_UNSUPPORTED_GROQ_MODEL";
      throw error;
    }
    if (!apiKey) {
      const error = new Error("إعداد Groq غير مكتمل: أنشئ مفتاحًا مجانيًا ثم فعّله من صفحة الاتصال والخصوصية.");
      error.statusCode = 503;
      error.code = "RAFID_PROVIDER_NOT_CONFIGURED";
      throw error;
    }
    return {
      provider,
      apiKey,
      baseURL: requestedBaseURL,
      model,
      apiMode: "chat_completions",
    };
  }
  if (provider === "azure_openai") {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const baseURL = String(process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
    const model = process.env.AZURE_OPENAI_DEPLOYMENT;
    if (!apiKey || !baseURL || !model) {
      const error = new Error(
        "إعداد Azure OpenAI غير مكتمل: يلزم AZURE_OPENAI_API_KEY وAZURE_OPENAI_ENDPOINT وAZURE_OPENAI_DEPLOYMENT.",
      );
      error.statusCode = 503;
      error.code = "RAFID_PROVIDER_NOT_CONFIGURED";
      throw error;
    }
    return { provider, apiKey, baseURL, model };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = String(
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  ).replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-5.6";
  if (!apiKey) {
    const error = new Error("إعداد OpenAI غير مكتمل: فعّل مفتاح API من صفحة الاتصال والخصوصية.");
    error.statusCode = 503;
    error.code = "RAFID_PROVIDER_NOT_CONFIGURED";
    throw error;
  }
  return { provider: "openai", apiKey, baseURL, model };
}

function activeProviderName() {
  return String(process.env.AI_PROVIDER || "openai").toLowerCase();
}

function positiveInteger(value, fallback, minimum) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback);
}

function providerTextLimit({ standardEnv, standardDefault, standardMinimum, groqEnv, groqDefault, groqMinimum }) {
  if (activeProviderName() === "groq") {
    return positiveInteger(process.env[groqEnv], groqDefault, groqMinimum);
  }
  return positiveInteger(process.env[standardEnv], standardDefault, standardMinimum);
}

function compactEvidencePayload(value) {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => compactEvidencePayload(item))
      .filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compactEvidencePayload(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}

function getClient() {
  const config = providerConfig();
  const timeout = analysisTimeoutMs();
  const key = `${config.provider}|${config.baseURL}|${config.model}|${config.apiKey.slice(-6)}|${timeout}`;
  if (!cachedClient || cachedConfigKey !== key) {
    OpenAIClient ||= require("openai");
    cachedClient = new OpenAIClient({ apiKey: config.apiKey, baseURL: config.baseURL, timeout });
    cachedConfigKey = key;
  }
  return { client: cachedClient, config };
}

function structuredOutputErrorText(error) {
  const parts = [
    error?.message,
    error?.code,
    error?.type,
    error?.error ? JSON.stringify(error.error) : "",
    error?.response?.data ? JSON.stringify(error.response.data) : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function isStructuredOutputSchemaError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  if (status !== 400) return false;
  return /failed_generation|does not match the expected schema|does not validate|json.?schema|response_format|schema validation/i.test(
    structuredOutputErrorText(error),
  );
}

function friendlyStructuredOutputError(error) {
  const wrapped = new Error(
    "تعذر تنظيم نتيجة الذكاء الاصطناعي وفق بنية رافد بعد محاولتين. أعد المحاولة مرة أخرى، وإن تكرر الخطأ استخدم مصدرًا أقصر أو استورد JSON منظمًا.",
  );
  wrapped.statusCode = 422;
  wrapped.code = "RAFID_STRUCTURED_OUTPUT_SCHEMA_FAILED";
  wrapped.cause = error;
  return wrapped;
}

function smartTruncate(text, maxChars) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return { text: value, truncated: false };

  const headSize = Math.floor(maxChars * 0.68);
  const tailSize = Math.floor(maxChars * 0.32);
  return {
    text: `${value.slice(0, headSize)}\n\n[... تم اختصار جزء من منتصف النص بسبب حد الحجم ...]\n\n${value.slice(-tailSize)}`,
    truncated: true,
  };
}

async function extractWithAI({ rawText, metadata, files, privacy }) {
  const maxChars = providerTextLimit({
    standardEnv: "RAFID_MAX_TEXT_CHARS",
    standardDefault: 120_000,
    standardMinimum: 20_000,
    groqEnv: "GROQ_MAX_TEXT_CHARS",
    groqDefault: 5_000,
    groqMinimum: 2_500,
  });
  const prepared = smartTruncate(rawText, maxChars);
  const result = await runStructured({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt({
      rawText: prepared.text,
      metadata,
      files,
      truncated: prepared.truncated,
    }),
    schema: RAFID_EXTRACTION_SCHEMA,
    maxOutputTokens: 14000,
    privacy,
  });

  return { ...result, project: result.data, inputTruncated: prepared.truncated };
}

async function extractOpportunityWithAI({ sourceText, metadata, privacy }) {
  const maxChars = providerTextLimit({
    standardEnv: "RAFID_MAX_TEXT_CHARS",
    standardDefault: 120_000,
    standardMinimum: 20_000,
    groqEnv: "GROQ_MAX_OPPORTUNITY_SOURCE_CHARS",
    groqDefault: 6_000,
    groqMinimum: 3_000,
  });
  const prepared = smartTruncate(sourceText, maxChars);
  const result = await runStructured({
    systemPrompt: OPPORTUNITY_SYSTEM_PROMPT,
    userPrompt: buildOpportunityPrompt({
      sourceText: prepared.text,
      metadata,
      truncated: prepared.truncated,
    }),
    schema: RAFID_OPPORTUNITY_SCHEMA,
    maxOutputTokens: 16000,
    privacy,
  });

  return {
    ...result,
    opportunity: result.data,
    inputTruncated: prepared.truncated,
  };
}

async function assessWithAI({ opportunity, project, context, privacy }) {
  const groq = activeProviderName() === "groq";
  const opportunityMax = providerTextLimit({
    standardEnv: "RAFID_MAX_OPPORTUNITY_CHARS",
    standardDefault: 90_000,
    standardMinimum: 30_000,
    groqEnv: "GROQ_MAX_OPPORTUNITY_CHARS",
    groqDefault: 5_000,
    groqMinimum: 2_500,
  });
  const projectMax = providerTextLimit({
    standardEnv: "RAFID_MAX_PROJECT_JSON_CHARS",
    standardDefault: 110_000,
    standardMinimum: 30_000,
    groqEnv: "GROQ_MAX_PROJECT_JSON_CHARS",
    groqDefault: 6_000,
    groqMinimum: 3_000,
  });
  const opportunityForPrompt = groq ? compactEvidencePayload(opportunity) || {} : opportunity;
  const projectForPrompt = groq ? compactEvidencePayload(project) || {} : project;
  const preparedOpportunity = smartTruncate(
    JSON.stringify(opportunityForPrompt, null, groq ? 0 : 2),
    opportunityMax,
  );
  const preparedProject = smartTruncate(
    JSON.stringify(projectForPrompt, null, groq ? 0 : 2),
    projectMax,
  );
  const truncated = preparedOpportunity.truncated || preparedProject.truncated;
  const result = await runStructured({
    systemPrompt: ASSESSMENT_SYSTEM_PROMPT,
    userPrompt: buildAssessmentPrompt({
      opportunityJson: preparedOpportunity.text,
      projectJson: preparedProject.text,
      context,
      truncated,
      compact: groq,
    }),
    schema: groq ? RAFID_COMPACT_ASSESSMENT_SCHEMA : RAFID_ASSESSMENT_SCHEMA,
    maxOutputTokens: 18000,
    privacy,
    reasoningEffort: groq ? process.env.GROQ_ASSESSMENT_REASONING_EFFORT || "medium" : undefined,
  });

  return { ...result, assessment: result.data, inputTruncated: truncated };
}

async function runStructured({
  systemPrompt,
  userPrompt,
  schema,
  maxOutputTokens = 14000,
  privacy = {},
  reasoningEffort,
}) {
  const { client, config } = getClient();
  const dataPolicy = assertDataPolicy(config, privacy);
  const configuredReasoningEffort = String(
    reasoningEffort ||
      (config.provider === "groq"
        ? process.env.GROQ_REASONING_EFFORT || "low"
        : process.env.RAFID_REASONING_EFFORT || "high"),
  ).toLowerCase();
  const allowedReasoning = ["none", "low", "medium", "high", "xhigh", "max"];
  const effectiveReasoning = allowedReasoning.includes(configuredReasoningEffort)
    ? configuredReasoningEffort
    : "high";
  const effectiveMaxOutputTokens =
    config.provider === "groq"
      ? Math.min(
          maxOutputTokens,
          positiveInteger(process.env.GROQ_MAX_OUTPUT_TOKENS, 2_600, 1_200),
        )
      : maxOutputTokens;
  const chatRequest = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${userPrompt}\n\nالتزم بمخطط JSON المرفق في response_format دون إضافة نص خارجه. اجعل النصوص موجزة، ولا تكرر الدليل نفسه.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schema.name,
        strict: schema.strict,
        schema: schema.schema,
      },
    },
    reasoning_effort: ["none", "low", "medium", "high"].includes(effectiveReasoning)
      ? effectiveReasoning
      : "high",
    // درجة حرارة صفر تقلل اختلاف أسماء enum وتزيد ثبات JSON المنظم.
    temperature: 0,
  };
  if (config.provider === "groq") {
    chatRequest.reasoning_format = "hidden";
    chatRequest.max_completion_tokens = effectiveMaxOutputTokens;
  } else {
    chatRequest.max_tokens = effectiveMaxOutputTokens;
  }
  let response;
  if (config.apiMode === "chat_completions") {
    try {
      response = await client.chat.completions.create(chatRequest);
    } catch (error) {
      if (config.provider !== "groq" || !isStructuredOutputSchemaError(error)) throw error;

      // Groq قد يعيد 400 إذا أنشأ النموذج قيمة لا تطابق enum حرفيًا.
      // نعيد المحاولة مرة واحدة بتعليمات تصحيح صريحة بدل إظهار الخطأ للمستخدم مباشرة.
      const retryRequest = {
        ...chatRequest,
        messages: [
          ...chatRequest.messages,
          {
            role: "user",
            content:
              "هذه إعادة محاولة بعد فشل التحقق من JSON Schema. راجع كل حقل enum واستخدم فقط القيم الحرفية الموجودة في المخطط. لا تنشئ تسميات بديلة، ولا تضف أي نص خارج JSON.",
          },
        ],
        temperature: 0,
      };
      try {
        response = await client.chat.completions.create(retryRequest);
      } catch (retryError) {
        if (isStructuredOutputSchemaError(retryError)) {
          throw friendlyStructuredOutputError(retryError);
        }
        throw retryError;
      }
    }
  } else {
    response = await client.responses.create({
      model: config.model,
      store: dataPolicy.store,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      text: { format: schema },
      reasoning: { effort: effectiveReasoning },
      max_output_tokens: effectiveMaxOutputTokens,
    });
  }

  const outputText =
    config.apiMode === "chat_completions"
      ? String(response.choices?.[0]?.message?.content || "")
      : response.output_text || "";
  if (!outputText) {
    const refusal =
      response.output
        ?.flatMap((item) => item.content || [])
        .find((content) => content.type === "refusal")?.refusal ||
      response.choices?.[0]?.message?.refusal;
    throw new Error(refusal || "لم يرجع النموذج بيانات قابلة للقراءة.");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new Error(`أعاد النموذج مخرجات غير صالحة كـ JSON: ${error.message}`, {
      cause: error,
    });
  }

  return {
    data: parsed,
    provider: config.provider,
    model: config.model,
    responseId: response.id || null,
    usage: response.usage || null,
    dataPolicy,
  };
}

function currentProviderStatus() {
  const configurationMode =
    String(process.env.RAFID_PROVIDER_CONFIGURATION_MODE || "local_session").toLowerCase() ===
    "server"
      ? "server"
      : "local_session";
  try {
    const config = providerConfig();
    const dataPolicy = dataPolicyFor(config);
    return {
      configured: true,
      ready: dataPolicy.mode !== "strict_zdr" || dataPolicy.zero_data_retention_confirmed,
      provider: config.provider,
      model: config.model,
      configuration_mode: configurationMode,
      data_policy: dataPolicy,
    };
  } catch (error) {
    return {
      configured: false,
      ready: false,
      provider: String(process.env.AI_PROVIDER || "openai").toLowerCase(),
      model: null,
      configuration_mode: configurationMode,
      error: error.message,
      data_policy: null,
    };
  }
}

function resetAIClient() {
  cachedClient = null;
  cachedConfigKey = null;
}

module.exports = {
  extractWithAI,
  extractOpportunityWithAI,
  assessWithAI,
  runStructured,
  currentProviderStatus,
  smartTruncate,
  dataPolicyFor,
  assertDataPolicy,
  isStructuredOutputSchemaError,
  resetAIClient,
};
