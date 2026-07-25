"use strict";

const path = require("node:path");

const ACCEPTED_TYPES = Object.freeze({
  pdf: new Set(["application/pdf"]),
  docx: new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  txt: new Set(["text/plain"]),
});
const MIN_WORDS = 3;

class IngestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IngestError";
    this.code = code;
  }
}

function safeDisplayName(value) {
  const name = path.basename(String(value || "مستند"))
    .replace(/[\p{Cc}<>:"/\\|?*]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (name || "مستند").slice(0, 120);
}

function extensionOf(name) {
  const extension = path.extname(safeDisplayName(name)).slice(1).toLowerCase();
  return ["pdf", "docx", "txt"].includes(extension) ? extension : "";
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/u).filter(Boolean).length;
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n?/g, "\n").replaceAll("\u0000", "").trim();
}

function decodeText(buffer) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!input.length) throw new IngestError("INGEST_EMPTY_FILE", "الملف فارغ.");
  const encodings = input[0] === 0xff && input[1] === 0xfe ? ["utf-16le"] : ["utf-8", "windows-1256"];
  for (const encoding of encodings) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(input);
      if (!text.includes("\u0000")) return normalizeText(text.replace(/^\uFEFF/, ""));
    } catch { continue; }
  }
  throw new IngestError("INGEST_UNREADABLE_TEXT", "تعذر قراءة ترميز الملف النصي.");
}

function assertMetadata(file, maxFileSizeMb) {
  const name = safeDisplayName(file?.name);
  const sourceType = extensionOf(name);
  const data = Buffer.isBuffer(file?.data) ? file.data : Buffer.from(file?.data || []);
  if (!sourceType) throw new IngestError("INGEST_UNSUPPORTED_TYPE", "يدعم رافد PDF وDOCX وTXT فقط.");
  if (!data.length) throw new IngestError("INGEST_EMPTY_FILE", "الملف فارغ.");
  const limit = Math.max(1, Number(maxFileSizeMb) || 20) * 1024 * 1024;
  if (data.length > limit) throw new IngestError("INGEST_FILE_TOO_LARGE", `حجم الملف يتجاوز الحد المسموح (${Math.floor(limit / 1024 / 1024)} ميغابايت).`);
  const mime = String(file?.mimeType || "").toLowerCase().trim();
  if (mime && !ACCEPTED_TYPES[sourceType].has(mime)) {
    throw new IngestError("INGEST_MIME_MISMATCH", "نوع الملف المعلن لا يطابق الصيغة المدعومة.");
  }
  if (sourceType === "pdf" && !data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new IngestError("INGEST_CORRUPT_DOCUMENT", "ملف PDF غير صالح أو تالف.");
  }
  if (sourceType === "docx" && !(data[0] === 0x50 && data[1] === 0x4b)) {
    throw new IngestError("INGEST_CORRUPT_DOCUMENT", "ملف DOCX غير صالح أو تالف.");
  }
  if (sourceType === "txt" && data.includes(0)) {
    throw new IngestError("INGEST_UNREADABLE_TEXT", "الملف النصي يحتوي بيانات ثنائية غير قابلة للقراءة.");
  }
  return { data, safeDisplayName: name, sourceType };
}

async function extractPdf(data) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(data), disableWorker: true, isEvalSupported: false }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      pages.push({ pageNumber, text: normalizeText(content.items.map((item) => item.str).join(" ")) });
    }
    return pages;
  } catch (error) {
    if (error instanceof IngestError) throw error;
    throw new IngestError("INGEST_CORRUPT_DOCUMENT", "تعذر قراءة ملف PDF. قد يكون تالفًا.");
  }
}

async function extractDocx(data) {
  try {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer: data });
    return normalizeText(result.value);
  } catch {
    throw new IngestError("INGEST_CORRUPT_DOCUMENT", "تعذر قراءة ملف DOCX. قد يكون تالفًا.");
  }
}

function completed(sourceType, safeName, text, pagesOrSections) {
  const fullText = normalizeText(text);
  const words = wordCount(fullText);
  if (!fullText) {
    throw new IngestError(sourceType === "pdf" ? "INGEST_PDF_NO_TEXT" : "INGEST_UNREADABLE_TEXT", sourceType === "pdf" ? "لا يحتوي ملف PDF على نص قابل للاستخراج. لا يدعم رافد OCR في هذه المرحلة." : "لا يحتوي الملف على نص قابل للقراءة.");
  }
  if (words < MIN_WORDS) throw new IngestError("INGEST_TEXT_TOO_SHORT", "النص قصير جدًا لإجراء تحليل موثوق.");
  return { fullText, pagesOrSections, sourceType, safeDisplayName: safeName, wordCount: words };
}

async function ingestFile(file, { maxFileSizeMb = 20 } = {}) {
  const checked = assertMetadata(file, maxFileSizeMb);
  if (checked.sourceType === "txt") {
    const text = decodeText(checked.data);
    return completed("txt", checked.safeDisplayName, text, [{ sectionNumber: 1, text }]);
  }
  if (checked.sourceType === "docx") {
    const text = await extractDocx(checked.data);
    return completed("docx", checked.safeDisplayName, text, text.split(/\n{2,}/).filter(Boolean).map((item, index) => ({ sectionNumber: index + 1, text: item })));
  }
  const pages = await extractPdf(checked.data);
  return completed("pdf", checked.safeDisplayName, pages.map((page) => page.text).join("\n\n"), pages);
}

function ingestText(value, { displayName = "نص مباشر" } = {}) {
  const text = normalizeText(value);
  return completed("text", safeDisplayName(displayName), text, [{ sectionNumber: 1, text }]);
}

module.exports = { IngestError, ingestFile, ingestText, safeDisplayName, wordCount };
