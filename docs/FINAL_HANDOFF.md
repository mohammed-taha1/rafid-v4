# التسليم النهائي لرافد MVP

## ملخص تنفيذي

رافد يحلل نصًا أو PDF/DOCX/TXT لإظهار الجاهزية البحثية والتمويلية بشكل استرشادي، من دون حفظ افتراضي للمحتوى.

## ما تم إصلاحه

استقرار التثبيت والبناء، حماية الأسرار، إدخال ملفات آمن، schema وprompts ومزوّد قابل للاختبار، معالجة النص الطويل، API وتحكم بالإلغاء، وواجهة عربية RTL.

## الملفات الرئيسية

`src/lib/research-schema.js` و`research-pipeline.js` و`research-provider.js` و`long-document.js`، و`frontend/research-ui.js` و`results-report.js`، و`render.yaml`.

## التحقق

نجحت typecheck وlint والاختبارات والبناء محليًا. مراجعة الأمان في `SECURITY_REVIEW.md`. النشر في `DEPLOYMENT.md`.

## Render والإعداد

استخدم Web Service و`npm ci && npm run build` ثم `npm start` وhealth check `/health`. متغيرات الخادم: `GROQ_API_KEY` و`GROQ_MODEL` و`MAX_FILE_SIZE_MB` و`ANALYSIS_TIMEOUT_SECONDS`. لا توجد أسرار مسموح بها للواجهة.

## إجراءات يدوية وقيود

دوّر أي مفتاح سبق مشاركته، فعّل ZDR، اضبط Supabase/RLS فقط عند الحاجة، ونفذ staging حيًا. لا يضمن رافد التمويل ولا يستبدل مستشارًا أو شروط الجهة.

## التراجع والمرحلة التالية

في Render أعد النشر من آخر إصدار ناجح. المرحلة التالية: اختبار حي مضبوط ثم ربط صفحات التعليم المرئية والتقييم الاختياري بعد موافقة صريحة.
