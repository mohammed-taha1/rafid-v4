# ابدأ رافد V4.3 — حسابات دائمة ومفتاح خادمي

## النتيجة في هذه النسخة

- المستخدم يدخل عبر **Google أو Microsoft أو GitHub أو رابط يصل إلى بريده**.
- الجلسة تُحفظ وتتجدد تلقائيًا حتى يسجل المستخدم الخروج أو تُلغى الجلسة.
- لكل مستخدم مساحة عمل خاصة تُحفظ تلقائيًا وتُحمى بسياسات قاعدة البيانات.
- مفتاح Groq واحد في الخادم؛ **لا يدخله المستخدم ولا يصل إلى المتصفح**.
- كل حساب له حد استخدام مستقل، مع حد يومي عام يحمي الحصة المجانية.

## ما تحتاج إنشاءه مرة واحدة بصفتك مالك رافد

1. حساب Groq ومفتاح API من https://console.groq.com/keys
2. تفعيل **Zero Data Retention** من https://console.groq.com/settings/data-controls
3. مشروع Supabase مجاني من https://supabase.com/dashboard
4. خادم أو استضافة عامة تعمل بـHTTPS لتصبح المنصة متاحة للناس. التشغيل على جهازك وحده لا يجعلها موقعًا عامًا.

لا ترسل مفتاح Groq في محادثة أو بريد، ولا تضعه في JavaScript أو HTML.

## إعداد Supabase

1. أنشئ مشروعًا جديدًا في Supabase.
2. افتح **Connect** وانسخ:
   - `Project URL`
   - `Publishable key`، وليس `service_role`.
3. افتح **SQL Editor**، ثم الصق وشغّل الملف كاملًا:
   - `supabase/rafid_schema.sql`
4. من **Authentication → URL Configuration** ضع رابط موقع رافد النهائي في `Site URL` وRedirect URLs.
5. البريد يعمل كرابط دخول دون كلمة مرور. فعّل Google من **Authentication → Sign In / Providers → Google** بعد إنشاء Google OAuth Client وإضافة Callback الظاهر في Supabase.
6. Microsoft وGitHub اختياريان، ويُفعّلان بالطريقة نفسها من صفحة Providers.

التفصيل المصور نصيًا موجود في `docs/SUPABASE_SETUP_AR.md`.

## ربط الأسرار بالخادم

انسخ `.env.example` إلى `.env` للاختبار فقط، ثم ضع القيم الآتية:

```text
RAFID_DEPLOYMENT_MODE=shared
RAFID_PROVIDER_CONFIGURATION_MODE=server
AI_PROVIDER=groq
GROQ_API_KEY=مفتاحك_السري
GROQ_MODEL=openai/gpt-oss-120b
RAFID_DATA_POLICY=strict_zdr
GROQ_ZERO_DATA_RETENTION_CONFIRMED=true

RAFID_AUTH_REQUIRED=true
RAFID_AUTH_PROVIDERS=google,azure,github,email
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=مفتاح_Supabase_العام
```

في الاستضافة العامة، ضع `GROQ_API_KEY` في **Secrets / Environment Variables** لدى المستضيف، ولا ترفع ملف `.env` إلى GitHub.

الحزمة جاهزة لطريقتين: تشغيل Node مباشر بأمر `npm start`، أو بناء `Dockerfile`. اجعل الواجهة والخادم على نطاق HTTPS واحد إن أمكن؛ هذا أبسط وأقل عرضة لأخطاء CORS. لا يكفي رفع مجلد `frontend` وحده، لأن مفتاح Groq ومسارات AI يجب أن تعمل في الخادم.

## اختبار النسخة على جهازك

افتح PowerShell داخل مجلد الحزمة ونفّذ:

```powershell
Copy-Item .env.example .env
notepad .env
npm.cmd install
npm.cmd run rafid
```

بعد حفظ القيم في Notepad افتح:

```text
http://127.0.0.1:8080
```

للدخول عبر Google محليًا، أضف `http://127.0.0.1:8080/` إلى Redirect URLs في Supabase. Microsoft قد يتطلب `localhost` بدل `127.0.0.1`، لذلك افتح `http://localhost:8080` عند اختباره.

## ما يحدث للمستخدم

1. يفتح الموقع ويسجل الدخول مرة واحدة.
2. يعود تلقائيًا إلى مساحته المحفوظة.
3. يضيف رابط الفرصة أو دليلها.
4. يرفع المشروع ويوافق على معاينة الخصوصية.
5. رافد يستخرج الشروط، يحسم الأهلية، وينشئ خطة إغلاق الفجوات.
6. كل تغيير منظم يُحفظ تلقائيًا. النصوص الخام ومفتاح Groq لا تُحفظ في مساحة العمل.

## حدود يجب معرفتها

- Groq المجاني حصة مشتركة، وليس خدمة غير محدودة لكل المستخدمين.
- Supabase المجاني مناسب للتجربة، وقد يوقف المشروع بعد أسبوع من عدم النشاط وفق خطته الحالية.
- تسجيل الدخول والحفظ لا يجعلان النموذج السحابي محليًا؛ النص المنقح يمر عبر Groq. المحتوى **المقيّد** يظل محظورًا عن أي API خارجي.
- لا يمكنني إجراء اختبار دخول أو استدعاء Groq حي دون حساباتك، ولا ينبغي أن ترسل مفاتيحك إليّ.
