# DeepSeek for Rafid

DeepSeek is the active production provider. It passed a live non-sensitive
opportunity extraction, project extraction, assessment, and general-readiness test.

Server-only configuration:

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=replace-with-server-secret
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_EXTRACTION_MODEL=deepseek-flash
DEEPSEEK_OPPORTUNITY_MODEL=deepseek-flash
DEEPSEEK_ASSESSMENT_MODEL=deepseek-flash
DEEPSEEK_ZERO_DATA_RETENTION_CONFIRMED=false
RAFID_REASONING_EFFORT=none
```

Flash is the verified interactive baseline. Pro exceeded the synchronous timeout
in production and must not be restored to the direct user path without a background
job, a larger timeout budget, and a fresh quality/performance comparison.
Only https://api.deepseek.com is permitted. Structured Responses use store:false,
bounded output, the existing SDK timeout/retries, and downstream validation.
The general-readiness route also selects DeepSeek and keeps deterministic scoring.

Do not treat store:false as a contractual ZDR guarantee. Strict mode blocks requests
until retention is verified. Standard processing requires an explicit policy decision;
this integration does not change RAFID_DATA_POLICY or permit confidential processing.

Activation was verified with a non-sensitive comparison and general-readiness request.
Repeat the same smoke tests after changing model, prompt, schema, or timeout settings.
Rollback: restore AI_PROVIDER=groq and redeploy. No database migration is needed.

Official reference: https://api-docs.deepseek.com/quick_start/pricing/
