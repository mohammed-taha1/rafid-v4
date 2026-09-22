# DeepSeek for Rafid

DeepSeek is the selected next provider. Production activation is pending a funded
DeepSeek API key, retention-policy approval, and a live non-sensitive evaluation.
Adding this integration does not change the currently running provider.

Server-only configuration:

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=replace-with-server-secret
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_EXTRACTION_MODEL=deepseek-v4-pro
DEEPSEEK_OPPORTUNITY_MODEL=deepseek-v4-pro
DEEPSEEK_ASSESSMENT_MODEL=deepseek-v4-pro
DEEPSEEK_ZERO_DATA_RETENTION_CONFIRMED=false
```

Pro is the initial quality baseline for every stage. After measuring evidence
accuracy, extraction and opportunity parsing can independently use deepseek-flash.
Only https://api.deepseek.com is permitted. Structured Responses use store:false,
bounded output, the existing SDK timeout/retries, and downstream validation.
The general-readiness route also selects DeepSeek and keeps deterministic scoring.

Do not treat store:false as a contractual ZDR guarantee. Strict mode blocks requests
until retention is verified. Standard processing requires an explicit policy decision;
this integration does not change RAFID_DATA_POLICY or permit confidential processing.

Activation: add the secret in Render, verify policy and balance, run a non-sensitive
comparison and general-readiness request, then evaluate evidence, time, and usage.
Rollback: restore AI_PROVIDER=groq and redeploy. No database migration is needed.

Official reference: https://api-docs.deepseek.com/quick_start/pricing/
