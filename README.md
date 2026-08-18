# رافد — تحليل جاهزية البحث وملاءمته لفرص التمويل

## بداية سريعة للنسخة الأولية

رافد يحلل نصًا أو PDF/DOCX/TXT بأربع خدمات: تقييم جاهزية عام، مقارنة البحث بفرصة محددة، اقتراح مسارات التمويل المناسبة، وترتيب محفظة مشاريع لفرصة واحدة. يعرض الأهلية والملاءمة والأدلة والفجوات وخطة الإغلاق دون تخزين افتراضي للنص أو الملف. يتطلب Node.js 22: شغّل `npm ci` ثم `npm run development`. الفحوص: `npm run quality` و`npm test` و`npm run lint` و`npm run typecheck`، والبناء: `npm run build`.

المسار الرئيسي الحالي:

1. أدخل نص أو ملف فرصة التمويل.
2. أدخل نص أو ملف البحث أو المشروع.
3. راجع بوابات الأهلية قبل الدرجة.
4. راجع أدلة البحث مقابل اقتباسات الفرصة.
5. نفذ خطة إغلاق الفجوات وحزمة التقديم.

تفاصيل المطابقة في [docs/OPPORTUNITY_MATCHING_SPEC.md](docs/OPPORTUNITY_MATCHING_SPEC.md)، واكتشاف الفرص والمحفظة في [docs/FUNDING_DISCOVERY_AND_PORTFOLIO.md](docs/FUNDING_DISCOVERY_AND_PORTFOLIO.md).

متغيرات الخادم: `GROQ_API_KEY` و`GROQ_MODEL` و`MAX_FILE_SIZE_MB` و`ANALYSIS_TIMEOUT_SECONDS`، ومتغيرات Supabase فقط عند تفعيل المصادقة. لوحة التشغيل الاختيارية تحتاج `RAFID_PRODUCT_TELEMETRY_ENABLED=true` و`SUPABASE_SERVICE_ROLE_KEY` على الخادم وحده. لا تضع أسرارًا في الواجهة. النشر في `docs/DEPLOYMENT.md`، التشغيل والقياس في `docs/PRODUCT_OPERATIONS.md`، والخصوصية والأمان في `docs/SECRET_ROTATION.md` و`docs/SECURITY_REVIEW.md`.

هذه النسخة تطبق قرار البداية الجديد لرافد:

> **فرصة تمويل حيّة واحدة + 5 إلى 10 مشاريع حقيقية + أهلية موثقة + خطة إغلاق فجوات + قرار مؤسسي قبل الموعد.**

رافد V4.3 ليس سوقًا عامًا للممولين، ولا يعطي «درجة جمال» للمشروع، ولا يعد بالتمويل. سؤال المنتج هنا محدد: **هل المشروع مؤهل لهذه الفرصة بالذات؟ وما الدليل؟ وما الذي يجب إغلاقه قبل التقديم؟**

## ما الذي تقدمه النسخة الحالية؟

- صفحة عربية واحدة تبدأ مباشرة بواجهة رافد الحالية، دون تحميل واجهة قديمة قبلها.
- تحليل عام للجاهزية أو مقارنة بحث بفرصة تمويل محددة.
- ترتيب مسارات تمويل موثقة المصدر دون الادعاء بأن التقديم مفتوح.
- مقارنة مؤسسية لعدة مشاريع، بالأهلية أولًا ثم الجاهزية والأدلة، مع تصدير CSV.
- بوابات أهلية وأدلة وفجوات وخطة إغلاق وحزمة تقديم قابلة للطباعة والتنزيل.
- مثال تدريبي افتراضي واضح الوسم لاختبار الرحلة دون بيانات شخصية أو ادعاء فرصة حقيقية.
- مفتاح Groq خادمي فقط، وحدود استخدام عامة لحماية الحصة المجانية.
- عدم تخزين نص البحث أو الملف افتراضيًا، وعدم اعتماد الصفحات العامة على Supabase.
- لوحة تشغيل خاصة بالمالك تعرض مقاييس مجمعة خالية من محتوى الأبحاث، مع دعوة زملاء بصلاحيتي مدير أو محلل.

ابدأ من [START_HERE_AR.md](START_HERE_AR.md)، وراجع النشر في [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## اختبار الخادم الكامل على Windows

أنشئ `.env` من المثال وأدخل أسرار **المالك** مرة واحدة، ثم شغّل:

```powershell
Copy-Item .env.example .env
notepad .env
npm.cmd install
npm.cmd run rafid
```

ثم افتح:

```text
http://127.0.0.1:8080
```

في وضع `server` لا تظهر حقول المفتاح للمستخدم. يقرأه الخادم من Environment/Secret ولا يرسله إلى المتصفح.

Groq + ZDR يمنع الاحتفاظ بمحتوى الطلب لدى المزود، لكنه يظل معالجة سحابية. إذا كان المطلوب ألا يغادر المحتوى الجهاز أصلًا، فالمسار الصحيح هو Ollama أو بنية داخلية معتمدة.

المسار الحالي:

1. اختر مقارنة البحث بفرصة محددة.
2. ألصق نص الفرصة أو ارفع PDF/DOCX/TXT.
3. ألصق البحث أو ارفع ملفه، ثم وافق على المعالجة المؤقتة.
4. راجع الأهلية والملاءمة والأدلة والفجوات وخطة العمل.

يمكن ضغط **تعبئة مثال تدريبي كامل** لتجهيز فرصة وبحث افتراضيين؛ تشغيل التحليل بعد ذلك يستخدم المزود الفعلي في بيئة الخادم.

### تشغيل محلي بلا إرسال البيانات إلى مزود سحابي

1. ثبّت Ollama من [الموقع الرسمي](https://ollama.com/download).
2. افتح PowerShell ونفّذ:

```powershell
ollama pull gpt-oss:20b
```

3. شغّل رافد، ثم اختر **Ollama + gpt‑oss — محلي** في صفحة الاتصال.

Ollama يوفّر API محليًا ويدعم Structured Outputs. هذا المسار هو الأقوى في الخصوصية، بينما Groq هو مسار البداية المجاني دون تثبيت محلي، وGPT‑5.6 مسار الجودة السحابية الأعلى. تعتمد السرعة المحلية على جهازك.

## ما الذي تغير عن V3.1؟

- أضيف Groq كمسار افتراضي مجاني مع `openai/gpt-oss-120b` وJSON Schema الصارم.
- أضيف تحقق مباشر من صلاحية مفتاح Groq ووجود النموذج دون إرسال محتوى المشروع.
- أضيف دعم Groq ZDR مع إبقاء بيانات الاستخدام الوصفية منفصلة عن محتوى الطلب.
- أضيف ضغط تلقائي للحقول الفارغة وحدود محافظة تناسب الخطة المجانية، مع إظهار أثر الاختصار في بيانات النتيجة.
- أضيف خادم محلي موحد يشغّل الواجهة وAPI بأمر واحد: `npm.cmd run rafid`، دون Azure Functions Core Tools.
- بقي إعداد المفتاح من واجهة `localhost` كخيار شخصي احتياطي فقط؛ في وضع المنصة المشتركة يكون المفتاح سرًا خادميًا دائمًا ولا يستطيع المستخدم تغييره أو رؤيته.
- أضيف Ollama عبر API محلي مع `gpt-oss:20b` لمنع خروج المحتوى من الجهاز.
- أضيف جلب آمن لنص صفحة الفرصة من رابط HTTPS عام، مع منع عناوين الشبكات الداخلية.
- أصبح إدخال المشروع يشغّل الاستخراج والمطابقة وفتح القرار تلقائيًا بعد موافقة خصوصية واحدة.
- أضيف وضع `strict_zdr` الذي يمنع الاتصال السحابي إن لم يكن Zero Data Retention مؤكدًا.
- يعرض الخادم سياسة البيانات الفعلية مع كل نتيجة، ولا يساوي بين `store:false` وZDR.

- أضيف استخراج منظم لفرصة التمويل وشروطها واقتباس كل بوابة أهلية.
- أضيف تقييم مشروع **مقابل الفرصة** بدل التقييم العام أو مطابقة فئات ممولين.
- لا تتغلب الدرجة على بوابة أهلية فاشلة؛ يُشتق قرار الأهلية حتميًا في الخادم.
- إذا أغفل النموذج شرطًا إلزاميًا صارمًا، يعيده رافد تلقائيًا بحالة **غير معروف**.
- أضيف سجل فجوات يحدد الإجراء والدليل والمالك والموعد ومعيار الإغلاق.
- أضيف حزمة تقديم ومراجعة بشرية مستقلة عن توصية الذكاء الاصطناعي.
- أضيف قياس تجربة: زمن القرار، اتفاق مراجع ثانٍ، الفجوات المغلقة، والتقديم قبل الموعد.
- أضيف **حاجز خصوصية** في المتصفح والخادم، مع منع المحتوى المقيّد من أي API خارجي.
- أزيل أي اعتماد وقت التشغيل على CDN؛ قارئا PDF وDOCX مرفقان محليًا.
- حذفت واجهة V3.1 وأصولها القديمة من الحزمة بعد إثبات عدم استخدامها، وأصبح أول HTML يصل للمستخدم هو هيكل رافد الحالي.

## البنية

```text
frontend/index.html
  ├─ research-ui.js: رحلة الإدخال والنتيجة
  ├─ advanced-services.js: اكتشاف الفرص والمحفظة المؤسسية
  ├─ rafid-ingest.js: قراءة PDF/DOCX/TXT محليًا
  ├─ opportunity-match.js: عقد الطلب والتحقق من النتيجة
  └─ demo-data.js: مثال تدريبي غير حقيقي

خادم رافد المحلي أو Azure Function
  ├─ يتحقق من الطلب ويحمي الحصة المشتركة
  ├─ GET  /api/rafid/public/config
  ├─ POST /api/rafid/source/fetch
  ├─ POST /api/rafid/opportunity/extract
  ├─ POST /api/rafid/extract
  ├─ POST /api/rafid/opportunity/assess
  ├─ GET  /api/rafid/opportunities/catalog
  ├─ POST /api/rafid/opportunities/discover
  └─ POST /api/rafid/portfolio/compare
            ↓
        Groq أو OpenAI أو Azure OpenAI أو Ollama محلي
```

نقطة `/api/rafid/extract` تستخرج عناصر البحث، ثم يربطها `/api/rafid/opportunity/assess` بشروط الفرصة. لا توجد واجهة V3 في الحزمة الحالية.

## التشغيل المنفصل المتقدم عبر Azure Functions

المتطلبات: Node.js 20.16 فأحدث ضمن الإصدار 20، أو Node.js 22، وAzure Functions Core Tools v4.

```bash
cp local.settings.example.json local.settings.json
# عدّل المفتاح والمزود والإعدادات
npm install
npm run check
npm test
npm run azure
```

في الوضع المشترك تستخدم الواجهة جلسة Supabase تلقائيًا وترسل JWT قصير العمر إلى خادم رافد. لا يدخل المستخدم رمز وصول ولا مفتاح Groq.

## إعداد مزود الذكاء الاصطناعي عبر متغيرات البيئة

### Groq مجاني + ZDR

```text
AI_PROVIDER=groq
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
GROQ_BASE_URL=https://api.groq.com/openai/v1
RAFID_DATA_POLICY=strict_zdr
GROQ_ZERO_DATA_RETENTION_CONFIRMED=true
GROQ_REASONING_EFFORT=low
```

لا تجعل قيمة `GROQ_ZERO_DATA_RETENTION_CONFIRMED=true` إلا بعد تفعيل ZDR فعليًا من Data Controls. الخطة المجانية لها حدود استخدام؛ القيم `GROQ_MAX_*` في `.env.example` تقلل الحقول الفارغة وتضبط حجم الطلب. قد يختصر رافد المصادر الطويلة ويصرح بذلك بدل إرسال طلب سيفشل.

### OpenAI مباشر

```text
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=اسم_النموذج_المعتمد
OPENAI_BASE_URL=https://api.openai.com/v1
RAFID_DATA_POLICY=strict_zdr
OPENAI_ZERO_DATA_RETENTION_CONFIRMED=false
RAFID_REASONING_EFFORT=high
```

### Azure OpenAI / Microsoft Foundry

```text
AI_PROVIDER=azure_openai
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=اسم_نشر_النموذج
```

اسم النشر هو الاسم الذي اخترته عند نشر النموذج، وليس بالضرورة اسم عائلة النموذج.

## نقاط API

### فحص الصحة

```text
GET /api/rafid/health
```

لا يعرض الرابط الداخلي للمزود أو المفتاح. يعرض النسخة والمزود والنموذج ونقاط الخدمة فقط.

### الإعداد العام قبل تسجيل الدخول

```text
GET /api/rafid/public/config
```

يعرض Project URL وSupabase Publishable key ومزودي الدخول المفعّلين. هذه قيم عامة مصممة للمتصفح؛ لا يعرض Groq key أو أي service role.

### استخراج فرصة

```text
POST /api/rafid/opportunity/extract
```

```json
{
  "metadata": {
    "title": "اسم الفرصة",
    "funder": "الجهة الممولة",
    "official_source_url": "https://example.org/call",
    "deadline": "2026-09-15",
    "source_name": "دليل التقديم.pdf"
  },
  "source_text": "النص الرسمي الكامل...",
  "privacy": {
    "classification": "internal",
    "remote_processing_confirmed": true,
    "redaction_preview_confirmed": true,
    "redactions_applied": ["email:1"]
  }
}
```

### استخراج مشروع

```text
POST /api/rafid/extract
```

نفس عقد V3.1 مع إضافة كائن `privacy`. راجع `samples/project-extract-request.json`.

### حسم مشروع مقابل فرصة

```text
POST /api/rafid/opportunity/assess
```

```json
{
  "opportunity": {},
  "project_data": {},
  "context": {
    "assessment_date": "2026-07-15",
    "reviewer_role": "مكتب البحث والابتكار"
  },
  "privacy": {
    "classification": "internal",
    "remote_processing_confirmed": true,
    "redaction_preview_confirmed": true,
    "redactions_applied": []
  }
}
```

يرجع التقييم بوابات الأهلية، الأدلة، الفجوات، خطة الإغلاق، حزمة التقديم، وتوصية تحتاج مراجعة مؤسسية.

## سياسة الخصوصية في هذه النسخة

| التصنيف | الإجراء |
|---|---|
| عام | معاينة وتنقيح المعرفات الظاهرة ثم يسمح بالاتصال |
| داخلي | تنقيح المعرفات المباشرة وإرسال الحد الأدنى فقط |
| سري | يتطلب ZDR مؤكدًا أو معالجة داخلية؛ يُرفض في الوضع القياسي افتراضيًا |
| مقيّد | **يمنع الاتصال الخارجي**؛ معالجة داخلية أو مراجعة بشرية فقط |

الدفاعات المطبقة:

- معاينة محلية إلزامية قبل كل عملية أو دفعة بعيدة.
- تنقيح بريد وهاتف وهوية وطنية وآيبان ومفاتيح/رموز وأسماء أشخاص في مواضع الهوية.
- مصطلحات تنقيح مخصصة يضيفها المستخدم.
- تحقق ثانٍ في الخادم من التصنيف والتأكيد، مع رفض `restricted` افتراضيًا.
- `store: false` في كل طلب Responses API لمنع التخزين التطبيقي للنتيجة.
- الوضع الافتراضي `strict_zdr` يرفض الاتصال إذا لم تُسجل المؤسسة أن ZDR معتمد لحسابها.
- الوضع `standard` متاح بقرار صريح فقط؛ لا يدعي انعدام الاحتفاظ.
- لا تُسجل عناوين المشاريع أو نصوصها أو أسماء الباحثين؛ السجلات تقتصر على معرف طلب عشوائي، الأحجام، الحالة، المدة، المزود والنموذج.
- لا تُحفظ النصوص الخام تلقائيًا في Local Storage أو التصدير.
- في الوضع المشترك، مفتاح المزود Secret/Environment في الخادم ولا يرجع في أي استجابة ولا يمكن تغييره من الواجهة.
- جلسة Supabase تُحفظ في متصفح المستخدم وتتجدد تلقائيًا؛ سجل الخروج على الأجهزة العامة.
- مساحة العمل المنظمة فقط تُحفظ في `rafid_workspaces`، وتحصرها RLS في صاحبها. لا تُحفظ النصوص الخام أو مفاتيح API.
- يتوقف الحفظ السحابي افتراضيًا للمساحة «السرية» أو «المقيّدة».

### الفرق الضروري بين `store:false` وZero Data Retention

- في Groq، طلبات الاستدلال لا تُحتفظ افتراضيًا، وقد تُسجّل مؤقتًا فقط لأعطال الاعتمادية أو الاشتباه بإساءة الاستخدام حتى 30 يومًا؛ تفعيل ZDR يمنع هذا الاحتفاظ بالمحتوى. تبقى بيانات استخدام وصفية بلا مدخلات أو مخرجات.
- Groq لا يستخدم المدخلات والمخرجات للتدريب إلا بإذن صريح وفق اتفاقية الخدمة.
- مرجع Groq: [Your Data in GroqCloud](https://console.groq.com/docs/your-data).

- بيانات OpenAI API لا تُستخدم لتدريب النماذج افتراضيًا ما لم تختَر المشاركة.
- `store:false` يمنع تخزين حالة Responses API، لكنه لا يلغي وحده سجلات مراقبة إساءة الاستخدام.
- في الحساب القياسي قد تتضمن سجلات المراقبة محتوى وتُحتفظ حتى 30 يومًا وفق السياسة الرسمية.
- ZDR إعداد مؤسسي يحتاج موافقة المزود؛ عند اعتماده تُستبعد محتويات العميل من سجلات المراقبة للنقاط المؤهلة.

المرجع الرسمي: [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint).

> Supabase Auth + RLS مناسبان لتجربة متعددة المستخدمين، لكن الأدوار المؤسسية التفصيلية، موافقة المسؤول، وسجل التدقيق الطويل ما زالت مرحلة إنتاج لاحقة.

## إعدادات الأمان

```text
RAFID_DEPLOYMENT_MODE=shared
RAFID_PROVIDER_CONFIGURATION_MODE=server
RAFID_AUTH_REQUIRED=true
RAFID_AUTH_PROVIDERS=google,azure,github,email
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=replace_with_supabase_anon_key
RAFID_ALLOWED_ORIGINS=https://your-frontend.example
APP_NAME=Rafid
APP_URL=https://your-frontend.example
MAX_FILE_SIZE_MB=20
ANALYSIS_TIMEOUT_SECONDS=60
RATE_LIMIT_REQUESTS=12
RATE_LIMIT_WINDOW_MINUTES=10
RAFID_MAX_TEXT_CHARS=120000
RAFID_MAX_OPPORTUNITY_CHARS=90000
RAFID_MAX_PROJECT_JSON_CHARS=110000
RAFID_MAX_REQUEST_BYTES=1500000
RAFID_GLOBAL_DAILY_AI_LIMIT=240
RAFID_ALLOW_LEGACY_REQUESTS=false
RAFID_DATA_POLICY=strict_zdr
GROQ_ZERO_DATA_RETENTION_CONFIRMED=false
OPENAI_ZERO_DATA_RETENTION_CONFIRMED=false
GROQ_REASONING_EFFORT=low
RAFID_REASONING_EFFORT=high
RAFID_ALLOW_CONFIDENTIAL_STANDARD_PROCESSING=false
RAFID_ALLOW_CONFIDENTIAL_CLOUD_PERSISTENCE=false
RAFID_ALLOW_RESTRICTED_REMOTE_PROCESSING=false
```

لا تستخدم `*` في `RAFID_ALLOWED_ORIGINS` خارج التطوير المحلي.

## نشر Azure Function

على Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\deploy.ps1 -DataPolicy strict_zdr
```

ينشئ السكربت Function App ويضبط الإعدادات ويشغل الاختبارات وينشر الخادم. سيرفض `strict_zdr` المتابعة ما لم تؤكد اعتماد ZDR فعليًا. استضف مجلد `frontend/` على نطاق ثابت موثوق، ثم ضع نطاقه في `RAFID_ALLOWED_ORIGINS`.

## بروتوكول التجربة المدفوعة

راجع [docs/PILOT.md](docs/PILOT.md). الخلاصة:

1. جهة واحدة تملك قرارًا وتمتلك 5–10 ملفات حقيقية.
2. فرصة واحدة ما زالت مفتوحة، مع دليل رسمي وموعد واضح.
3. مراجعان على عينة لمعايرة الاتفاق.
4. خط أساس يدوي لزمن المراجعة وحكم الأهلية.
5. استخدام رافد لإغلاق الفجوات ثم تسجيل ما أُرسل فعليًا.
6. قرار استمرار أو تعديل بعد نتائج الدفعة، لا بعد الانطباعات.

معيار الإيقاف/التحول: إذا لم تمنحنا جهة واحدة فرصة حيّة وخمسة ملفات فعلية، أو لم يوفر رافد وقتًا/اتفاقًا/إغلاقًا ملموسًا، فلا نتوسع إلى سوق أو مناقصات بحثية.

## ما هو مؤجل عمدًا؟

- مطابقة عامة مع مئات الممولين.
- سوق ثنائي الجانب بين الباحثين والممولين.
- «مناقصات بحثية» تطرح فيها الشركات مشاكلها.
- تنبؤ باحتمال الفوز.
- إرسال الطلب تلقائيًا إلى الجهة الممولة.

هذه مراحل لاحقة فقط بعد إثبات أن «حسم فرصة واحدة» مشكلة متكررة ومستعد طرف مؤسسي للدفع مقابلها.

## التحقق

```bash
npm run check
npm test
```

الاختبارات الحالية تغطي:

- أن الدرجة لا تتغلب على بوابة أهلية فاشلة.
- إعادة الشرط الصارم الذي أغفله النموذج بحالة «غير معروف».
- ترتيب المشاريع المؤهلة/المشروطة قبل غير المؤهلة.
- رفض المحتوى المقيّد في الخادم.
- تنقيح معرفات شائعة في الواجهة.
- سلامة المعرفات والملفات المحلية وعدم وجود أصل خارجي وقت التشغيل.

يوجد اختبار متصفح اختياري في `scripts/ui-smoke.js` يتطلب Playwright مع Chromium مثبتًا.
