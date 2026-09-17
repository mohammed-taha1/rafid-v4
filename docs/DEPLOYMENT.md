# النشر المستقر على Render

> أصبح Render في خطة الانتقال خادم التحليل والأصل الاحتياطي، وتُنشر الواجهة الثابتة على Cloudflare بعد اجتياز بوابات التحقق. راجع `docs/CLOUDFLARE_MIGRATION.md` للقياسات وخطوات الانتقال والتراجع.

الخدمة المناسبة هي Render Web Service لأن التطبيق Node واحد يقدم الواجهة وAPI من الأصل نفسه.

1. اربط المستودع واختر الفرع `main` بعد اجتياز Pull Request لفحص `verify` الإلزامي.
2. استخدم `render.yaml` أو اضبط Build: `npm ci && npm run build` وStart: `npm start`، والجذر هو المستودع.
3. أضف أسرار الخادم فقط في لوحة Render: `GROQ_API_KEY` و`GROQ_MODEL` وبيانات Supabase عند تفعيل المصادقة. لتشغيل لوحة القياس أضف `SUPABASE_SERVICE_ROLE_KEY` إلى الخادم فقط واضبط `RAFID_PRODUCT_TELEMETRY_ENABLED=true`. لا تضع مفتاح الخدمة في YAML أو الواجهة أو أي متغير عام.
4. في Supabase Auth فعّل Google، واضبط Site URL على `https://rafid.rafid-platform.workers.dev/`، وأضف عنوان العودة الدقيق `https://rafid.rafid-platform.workers.dev/?rafid_auth=institution` إلى Redirect URLs. أبقِ روابط Render القديمة لتوافق رابط QR. يزيل رافد بيانات العودة من شريط العنوان ويحفظ جلسة المؤسسة داخل التبويب فقط.
5. اضبط `RAFID_HOST=0.0.0.0`، `MAX_FILE_SIZE_MB=20`، و`MAX_ANALYSIS_INPUT_CHARS=16000`، و`ANALYSIS_TIMEOUT_SECONDS=120`. يحمي حد الإدخال طلب Groq من تجاوز السعة؛ وعند تجاوزه تظهر نتيجة مع تنبيه بأنها غطّت الجزء المقبول فقط.
6. اجعل health check هو `/health`. يعيد حالة تشغيل عامة فقط ولا يفحص مفتاح AI ولا يكشف أسرارًا.

بعد النشر: افتح `/health` ثم الصفحة العامة دون Supabase، وجرّب إدخالًا غير حساس. Cold start قد يسبب تأخرًا قصيرًا؛ تعرض الواجهة رسالة انتظار ولا تعد بزمن ثابت.

لوحة التشغيل: سجل دخول حساب المالك من «رافد للمؤسسات»، ثم افتح «لوحة تشغيل رافد». نفّذ رحلة اختبار وتحقق من ظهور الحدث المجمع. لا تُسجل أحداث القياس إذا غاب مفتاح خدمة Supabase، لكن التحليل يستمر دون تعطل. راجع `docs/PRODUCT_OPERATIONS.md` لتعريفات المقاييس واختبار دعوات الزملاء.

Rollback: أعد النشر من آخر إصدار ناجح في Render أو ارجع إلى commit إصدار معتمد. أشهر الأعطال: فشل البناء (تحقق Node 22)، 503 للتحليل (تحقق مفاتيح الخادم وZDR)، وفشل الدخول (تحقق Redirect URLs في Supabase). لا يعتمد التطبيق على قرص Render لحفظ الملفات.

## Cloudflare للواجهة فقط

- إعداد النشر: `wrangler.jsonc`.
- أمر النشر: `npm run deploy:cloudflare`.
- الواجهة: `frontend` عبر Static Assets.
- مسارات الخادم: `/api/rafid/*` و`/health` تمر عبر Worker إلى `RAFID_API_ORIGIN`.
- لا تضع `GROQ_API_KEY` أو `SUPABASE_SERVICE_ROLE_KEY` في Cloudflare؛ تبقى أسرار التحليل على Render خلال هذه المرحلة.
- احتفظ بخدمة Render ورابطها القديم كي يظل QR الحالي صالحًا.
- الخدمة الحية الحالية `rafid-v4` تعمل على خطة Render المجانية، مرتبطة بـ`main`، وCloudflare هو الواجهة العامة الأسرع.
