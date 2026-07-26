# إعداد حسابات رافد وحفظ المستخدمين عبر Supabase

هذا الإعداد يتم مرة واحدة من مالك المنصة. بعده لا يضع المستخدمون أي مفتاح، وتبقى جلساتهم ومساحاتهم محفوظة.

## 1. أنشئ المشروع

1. افتح https://supabase.com/dashboard وسجل الدخول.
2. اضغط **New project** واختر اسمًا مثل `rafid-production`.
3. احفظ كلمة مرور قاعدة البيانات في مدير كلمات مرور؛ لا يحتاجها متصفح رافد.
4. انتظر اكتمال إنشاء المشروع.

## 2. خذ القيم العامة الصحيحة

من زر **Connect** أو **Project Settings → API** انسخ:

- `Project URL` إلى `SUPABASE_URL`.
- `Publishable key` أو `anon key` إلى `SUPABASE_ANON_KEY`.

مفتاح Publishable مصمم للواجهة ويعمل مع RLS. لا تستخدم `service_role` في الواجهة أو ملف عام؛ فهو يتجاوز RLS.

## 3. أنشئ جدول مساحة العمل

1. افتح **SQL Editor**.
2. افتح الملف `supabase/rafid_schema.sql` من الحزمة.
3. انسخ محتواه كاملًا، ثم اضغط **Run**.

الملف ينشئ جدول `rafid_workspaces` ويفعّل Row Level Security. السياسات تسمح للمستخدم المسجل بقراءة وكتابة صفه وحده، وتمنع الزائر غير المسجل.

## 4. فعّل البريد

البريد مفعّل افتراضيًا عادةً في Supabase:

1. افتح **Authentication → Sign In / Providers → Email**.
2. أبقِ Email مفعّلًا.
3. رافد يستخدم Magic Link: يكتب المستخدم بريده ويفتح الرابط الآمن بدل إنشاء كلمة مرور.

للإنتاج الفعلي يفضل ربط Custom SMTP حتى تصل الرسائل باسم ونطاق رافد وبحدود إرسال مناسبة.

## 5. اضبط روابط العودة

1. افتح **Authentication → URL Configuration**.
2. ضع في `Site URL` رابط رافد النهائي، مثل `https://rafid.example.com`.
3. أضف الرابط نفسه في Redirect URLs.
4. للتجربة المحلية أضف `http://127.0.0.1:8080/` و`http://localhost:8080/`.

استخدم رابطًا دقيقًا في الإنتاج، ولا تستخدم wildcard واسعًا.

## 6. فعّل Google

1. في Google Cloud Console أنشئ OAuth Client من نوع Web Application.
2. انسخ Callback URL الظاهر داخل صفحة Google Provider في Supabase، وشكله عادة:

```text
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

3. أضف Callback إلى Authorized redirect URIs في Google.
4. انسخ Google Client ID وClient Secret إلى **Supabase → Authentication → Providers → Google**.
5. فعّل المزود واحفظ.

قد تطلب Google إعداد شاشة الموافقة والعلامة التجارية، وقد تحتاج مراجعة قبل الإطلاق العام.

## 7. فعّل Microsoft وGitHub اختياريًا

- Microsoft يظهر باسم **Azure (Microsoft)** ومفتاحه البرمجي في رافد هو `azure`.
- GitHub يحتاج OAuth App وCallback URL نفسه الخاص بمشروع Supabase.

إذا لم تفعّل مزودًا، احذفه من متغير الخادم. مثال للبريد وGoogle فقط:

```text
RAFID_AUTH_PROVIDERS=google,email
```

## 8. ضع أسرار الخادم

القيم الأساسية في Secrets / Environment Variables لدى الاستضافة:

```text
RAFID_DEPLOYMENT_MODE=shared
RAFID_PROVIDER_CONFIGURATION_MODE=server
RAFID_AUTH_REQUIRED=true
RAFID_AUTH_PROVIDERS=google,azure,github,email
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=replace_with_supabase_anon_key

AI_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
GROQ_BASE_URL=https://api.groq.com/openai/v1
RAFID_DATA_POLICY=strict_zdr
GROQ_ZERO_DATA_RETENTION_CONFIRMED=true

APP_NAME=Rafid
APP_URL=https://your-rafid-site.example
MAX_FILE_SIZE_MB=20
ANALYSIS_TIMEOUT_SECONDS=60
RATE_LIMIT_REQUESTS=12
RATE_LIMIT_WINDOW_MINUTES=10
RAFID_GLOBAL_DAILY_AI_LIMIT=240
RAFID_ALLOW_CONFIDENTIAL_CLOUD_PERSISTENCE=false
```

لا تضع `GROQ_API_KEY` أو `service_role` في GitHub أو HTML أو JavaScript. رافد لا يحتاج Supabase service role أصلًا.

## 9. تحقق بعد النشر

1. افتح الموقع في نافذة خاصة؛ يجب أن تظهر بوابة الدخول قبل التطبيق.
2. جرّب البريد ثم Google.
3. أضف فرصة تجريبية، أغلق المتصفح، وافتحه مجددًا؛ يجب أن تعود الجلسة والمساحة.
4. سجّل الخروج؛ يجب أن تختفي مساحة المستخدم من الشاشة، دون حذفها من حسابه.
5. حاول فتح API بلا جلسة؛ يجب أن يرجع `401`.
6. افحص Developer Tools وتأكد أن أي طلب إلى Groq غير موجود من المتصفح؛ الاتصال يجب أن يكون المتصفح → خادم رافد فقط.

الحفظ السحابي يتوقف افتراضيًا إذا صُنفت المساحة «سرية» أو «مقيّدة». لا تغيّر `RAFID_ALLOW_CONFIDENTIAL_CLOUD_PERSISTENCE` إلى `true` إلا بعد اعتماد Supabase تعاقديًا وأمنيًا لهذا النوع من البيانات.

## المراجع الرسمية

- Auth ومزودو الدخول: https://supabase.com/docs/guides/auth
- Google: https://supabase.com/docs/guides/auth/social-login/auth-google
- Microsoft: https://supabase.com/docs/guides/auth/social-login/auth-azure
- البريد دون كلمة مرور: https://supabase.com/docs/guides/auth/auth-email-passwordless
- الجلسات: https://supabase.com/docs/guides/auth/sessions
- Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
