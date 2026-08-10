"use strict";

(() => {
  const accepted = {
    pdf: ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    txt: ["text/plain"],
    md: ["text/markdown", "text/plain", ""],
  };
  const normalize = (value) => String(value || "").replace(/\r\n?/g, "\n").replaceAll("\u0000", "").trim();
  const count = (value) => normalize(value).split(/\s+/u).filter(Boolean).length;
  const safeName = (value) => String(value || "مستند").split(/[\\/]/).pop().replace(/[\p{Cc}<>:"/\\|?*]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "مستند";
  const fail = (code, message) => Object.assign(new Error(message), { code });

  async function read(file, { maxFileSizeMb = 20, progress } = {}) {
    const name = safeName(file?.name);
    const extension = (name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
    if (!Object.hasOwn(accepted, extension)) throw fail("INGEST_UNSUPPORTED_TYPE", "يدعم رافد PDF وDOCX وTXT وMD.");
    if (!file?.size) throw fail("INGEST_EMPTY_FILE", "الملف فارغ.");
    if (file.size > Math.max(1, Number(maxFileSizeMb) || 20) * 1024 * 1024) throw fail("INGEST_FILE_TOO_LARGE", `حجم الملف يتجاوز الحد المسموح (${maxFileSizeMb} ميغابايت).`);
    if (file.type && !accepted[extension].includes(file.type.toLowerCase())) throw fail("INGEST_MIME_MISMATCH", "نوع الملف المعلن لا يطابق الصيغة المدعومة.");
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let sections;
    if (extension === "pdf") {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw fail("INGEST_CORRUPT_DOCUMENT", "ملف PDF غير صالح أو تالف.");
      try {
        window.pdfjsLib ||= await import("./vendor/pdf.min.mjs");
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", location.href).href;
        const pdf = await window.pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise;
        sections = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const content = await (await pdf.getPage(pageNumber)).getTextContent();
          sections.push({ pageNumber, text: normalize(content.items.map((item) => item.str).join(" ")) });
          progress?.(`قراءة الصفحة ${pageNumber} من ${pdf.numPages}`);
        }
      } catch (error) { if (error.code) throw error; throw fail("INGEST_CORRUPT_DOCUMENT", "تعذر قراءة ملف PDF. قد يكون تالفًا."); }
    } else if (extension === "docx") {
      if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw fail("INGEST_CORRUPT_DOCUMENT", "ملف DOCX غير صالح أو تالف.");
      if (!window.mammoth) throw fail("INGEST_READER_UNAVAILABLE", "قارئ Word المحلي غير جاهز.");
      try { const result = await window.mammoth.extractRawText({ arrayBuffer: buffer }); sections = normalize(result.value).split(/\n{2,}/).filter(Boolean).map((text, index) => ({ sectionNumber: index + 1, text })); } catch { throw fail("INGEST_CORRUPT_DOCUMENT", "تعذر قراءة ملف DOCX. قد يكون تالفًا."); }
    } else {
      if (bytes.includes(0)) throw fail("INGEST_UNREADABLE_TEXT", "الملف النصي يحتوي بيانات ثنائية غير قابلة للقراءة.");
      let text;
      try { text = normalize(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { try { text = normalize(new TextDecoder("windows-1256", { fatal: true }).decode(bytes)); } catch { throw fail("INGEST_UNREADABLE_TEXT", "تعذر قراءة ترميز الملف النصي."); } }
      sections = [{ sectionNumber: 1, text }];
    }
    const fullText = normalize(sections.map((item) => item.text).join("\n\n"));
    if (!fullText) throw fail(extension === "pdf" ? "INGEST_PDF_NO_TEXT" : "INGEST_UNREADABLE_TEXT", extension === "pdf" ? "لا يحتوي ملف PDF على نص قابل للاستخراج. لا يدعم رافد OCR في هذه المرحلة." : "لا يحتوي الملف على نص قابل للقراءة.");
    const wordCount = count(fullText);
    if (wordCount < 3) throw fail("INGEST_TEXT_TOO_SHORT", "النص قصير جدًا لإجراء تحليل موثوق.");
    return { fullText, pagesOrSections: sections, sourceType: extension, safeDisplayName: name, wordCount };
  }

  window.RafidIngest = Object.freeze({ read });
})();
