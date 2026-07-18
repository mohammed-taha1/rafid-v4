param(
  [string]$ResourceGroup = "rafid-rg",
  [string]$Location = "uaenorth",
  [string]$FunctionAppName = "",
  [ValidateSet("groq", "openai", "azure_openai")]
  [string]$Provider = "groq",
  [ValidateSet("strict_zdr", "standard")]
  [string]$DataPolicy = "strict_zdr"
)

$ErrorActionPreference = "Stop"

function Require-Command($Name, $Help) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name غير مثبت. $Help"
  }
}

Require-Command "az" "ثبت Azure CLI ثم أعد المحاولة."
Require-Command "func" "ثبت Azure Functions Core Tools v4 ثم أعد المحاولة."
Require-Command "npm.cmd" "ثبت Node.js ثم أعد المحاولة."

if ([string]::IsNullOrWhiteSpace($FunctionAppName)) {
  $suffix = Get-Random -Minimum 10000 -Maximum 99999
  $FunctionAppName = "rafid-ai-$suffix"
}

$storage = ($FunctionAppName -replace "[^a-zA-Z0-9]", "").ToLower()
if ($storage.Length -gt 20) { $storage = $storage.Substring(0,20) }
if ($storage.Length -lt 3) { $storage = "rafid$((Get-Random -Minimum 10000 -Maximum 99999))" }

Write-Host "تسجيل الدخول إلى Azure..." -ForegroundColor Cyan
az login | Out-Null

Write-Host "إنشاء مجموعة الموارد..." -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location | Out-Null

Write-Host "إنشاء حساب التخزين: $storage" -ForegroundColor Cyan
az storage account create `
  --name $storage `
  --resource-group $ResourceGroup `
  --location $Location `
  --sku Standard_LRS `
  --kind StorageV2 | Out-Null

Write-Host "إنشاء Function App: $FunctionAppName" -ForegroundColor Cyan
az functionapp create `
  --resource-group $ResourceGroup `
  --consumption-plan-location $Location `
  --runtime node `
  --runtime-version 22 `
  --functions-version 4 `
  --os-type Linux `
  --name $FunctionAppName `
  --storage-account $storage | Out-Null

$AllowedOrigins = Read-Host "أدخل نطاق واجهة رافد المسموح، أو * للاختبار"
if ([string]::IsNullOrWhiteSpace($AllowedOrigins)) { $AllowedOrigins = "*" }

$SupabaseUrl = Read-Host "أدخل SUPABASE_URL، مثال https://abc.supabase.co"
$SupabasePublishableKey = Read-Host "أدخل Supabase Publishable key (عام وليس service_role)"
if (
  [string]::IsNullOrWhiteSpace($SupabaseUrl) -or
  -not $SupabaseUrl.StartsWith("https://") -or
  [string]::IsNullOrWhiteSpace($SupabasePublishableKey)
) {
  throw "SUPABASE_URL وPublishable key مطلوبان لتسجيل المستخدمين."
}
if ($SupabasePublishableKey -match "service_role") {
  throw "لا تستخدم service_role. استخدم Publishable key فقط."
}

$ZdrConfirmed = $false
if ($DataPolicy -eq "strict_zdr") {
  $ZdrAnswer = Read-Host "هل اعتمد المزود Zero Data Retention فعليًا لهذا الحساب/المشروع؟ اكتب YES فقط بعد التحقق"
  if ($ZdrAnswer -ne "YES") {
    throw "لا يمكن نشر الوضع الصارم دون ZDR مؤكد. استخدم -DataPolicy standard إذا قبلت سياسة المزود القياسية."
  }
  $ZdrConfirmed = $true
}

$settings = @(
  "RAFID_DEPLOYMENT_MODE=shared",
  "RAFID_PROVIDER_CONFIGURATION_MODE=server",
  "AI_PROVIDER=$Provider",
  "RAFID_AUTH_REQUIRED=true",
  "RAFID_AUTH_PROVIDERS=google,azure,github,email",
  "SUPABASE_URL=$SupabaseUrl",
  "SUPABASE_PUBLISHABLE_KEY=$SupabasePublishableKey",
  "RAFID_ALLOWED_ORIGINS=$AllowedOrigins",
  "RAFID_MAX_TEXT_CHARS=120000",
  "RAFID_MAX_OPPORTUNITY_CHARS=90000",
  "RAFID_MAX_PROJECT_JSON_CHARS=110000",
  "RAFID_MAX_REQUEST_BYTES=1500000",
  "RAFID_RATE_LIMIT_REQUESTS=12",
  "RAFID_RATE_LIMIT_WINDOW_SECONDS=600",
  "RAFID_GLOBAL_DAILY_AI_LIMIT=240",
  "RAFID_DATA_POLICY=$DataPolicy",
  "RAFID_REASONING_EFFORT=high",
  "GROQ_REASONING_EFFORT=low",
  "GROQ_MAX_TEXT_CHARS=5000",
  "GROQ_MAX_OPPORTUNITY_SOURCE_CHARS=6000",
  "GROQ_MAX_OPPORTUNITY_CHARS=5000",
  "GROQ_MAX_PROJECT_JSON_CHARS=6000",
  "GROQ_MAX_OUTPUT_TOKENS=2600",
  "RAFID_ALLOW_LEGACY_REQUESTS=false",
  "RAFID_ALLOW_CONFIDENTIAL_STANDARD_PROCESSING=false",
  "RAFID_ALLOW_CONFIDENTIAL_CLOUD_PERSISTENCE=false",
  "RAFID_ALLOW_RESTRICTED_REMOTE_PROCESSING=false"
)

if ($Provider -eq "groq") {
  $GroqKeySecure = Read-Host "أدخل GROQ_API_KEY" -AsSecureString
  $GroqKey = [System.Net.NetworkCredential]::new("", $GroqKeySecure).Password
  $GroqModel = Read-Host "اسم نموذج Groq [openai/gpt-oss-120b]"
  if ([string]::IsNullOrWhiteSpace($GroqModel)) { $GroqModel = "openai/gpt-oss-120b" }
  if ($GroqModel -notin @("openai/gpt-oss-120b", "openai/gpt-oss-20b")) {
    throw "نموذج Groq يجب أن يكون openai/gpt-oss-120b أو openai/gpt-oss-20b."
  }
  $settings += "GROQ_API_KEY=$GroqKey"
  $settings += "GROQ_MODEL=$GroqModel"
  $settings += "GROQ_BASE_URL=https://api.groq.com/openai/v1"
  $settings += "GROQ_ZERO_DATA_RETENTION_CONFIRMED=$($ZdrConfirmed.ToString().ToLower())"
} elseif ($Provider -eq "openai") {
  $OpenAIKeySecure = Read-Host "أدخل OPENAI_API_KEY" -AsSecureString
  $OpenAIKey = [System.Net.NetworkCredential]::new("", $OpenAIKeySecure).Password
  $OpenAIModel = Read-Host "اسم نموذج OpenAI [gpt-5.6]"
  if ([string]::IsNullOrWhiteSpace($OpenAIModel)) { $OpenAIModel = "gpt-5.6" }
  $settings += "OPENAI_API_KEY=$OpenAIKey"
  $settings += "OPENAI_MODEL=$OpenAIModel"
  $settings += "OPENAI_BASE_URL=https://api.openai.com/v1"
  $settings += "OPENAI_ZERO_DATA_RETENTION_CONFIRMED=$($ZdrConfirmed.ToString().ToLower())"
} else {
  $AzureKeySecure = Read-Host "أدخل AZURE_OPENAI_API_KEY" -AsSecureString
  $AzureKey = [System.Net.NetworkCredential]::new("", $AzureKeySecure).Password
  $AzureEndpoint = Read-Host "أدخل AZURE_OPENAI_ENDPOINT، مثال https://name.openai.azure.com/openai/v1"
  $AzureDeployment = Read-Host "أدخل اسم نشر النموذج AZURE_OPENAI_DEPLOYMENT"
  if ([string]::IsNullOrWhiteSpace($AzureEndpoint) -or [string]::IsNullOrWhiteSpace($AzureDeployment)) {
    throw "Endpoint واسم النشر مطلوبان."
  }
  $settings += "AZURE_OPENAI_API_KEY=$AzureKey"
  $settings += "AZURE_OPENAI_ENDPOINT=$AzureEndpoint"
  $settings += "AZURE_OPENAI_DEPLOYMENT=$AzureDeployment"
  $settings += "AZURE_ZERO_DATA_RETENTION_CONFIRMED=$($ZdrConfirmed.ToString().ToLower())"
}

Write-Host "رفع إعدادات البيئة الآمنة..." -ForegroundColor Cyan
az functionapp config appsettings set `
  --resource-group $ResourceGroup `
  --name $FunctionAppName `
  --settings $settings | Out-Null

Write-Host "تثبيت الحزم وفحص الكود..." -ForegroundColor Cyan
npm.cmd install
npm.cmd run check
npm.cmd test

Write-Host "نشر الدالة..." -ForegroundColor Cyan
func azure functionapp publish $FunctionAppName --javascript

$base = "https://$FunctionAppName.azurewebsites.net/api/rafid"
Write-Host "" 
Write-Host "تم النشر." -ForegroundColor Green
Write-Host "Health:  $base/health" -ForegroundColor Yellow
Write-Host "Project extract:     $base/extract" -ForegroundColor Yellow
Write-Host "Opportunity extract: $base/opportunity/extract" -ForegroundColor Yellow
Write-Host "Opportunity assess:  $base/opportunity/assess" -ForegroundColor Yellow
Write-Host "المفتاح خادمي، والمستخدمون يدخلون عبر Supabase دون رؤية مفتاح Groq." -ForegroundColor Green
Write-Host "تأكد أنك شغلت supabase/rafid_schema.sql وفعّلت مزودي Google/Microsoft/GitHub المطلوبين." -ForegroundColor Yellow
