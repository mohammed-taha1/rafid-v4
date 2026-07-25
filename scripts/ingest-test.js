"use strict";

const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { ingestFile, ingestText, IngestError } = require("../src/lib/ingest");

function pdf(text = "Arabic readiness analysis text") {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  let output = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

async function docx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>فقرة عربية أولى للتحليل</w:t></w:r></w:p><w:p><w:r><w:t>فقرة عربية ثانية مرتبة</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: "nodebuffer" });
}

async function rejects(file, code) { await assert.rejects(() => ingestFile(file), (error) => error instanceof IngestError && error.code === code); }

async function main() {
  assert.equal(ingestText("نص عربي صالح للتحليل").wordCount, 4);
  const txt = await ingestFile({ name: "طلب.txt", mimeType: "text/plain", data: Buffer.from("نص عربي صالح للتحليل") });
  assert.equal(txt.sourceType, "txt");
  const pdfResult = await ingestFile({ name: "ready.pdf", mimeType: "application/pdf", data: pdf() });
  assert.equal(pdfResult.pagesOrSections[0].pageNumber, 1);
  const docxResult = await ingestFile({ name: "ready.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: await docx() });
  assert.match(docxResult.fullText, /فقرة عربية أولى[\s\S]*فقرة عربية ثانية/);
  await rejects({ name: "empty.txt", mimeType: "text/plain", data: Buffer.alloc(0) }, "INGEST_EMPTY_FILE");
  await rejects({ name: "broken.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-broken") }, "INGEST_CORRUPT_DOCUMENT");
  await rejects({ name: "script.js", mimeType: "text/javascript", data: Buffer.from("alert(1)") }, "INGEST_UNSUPPORTED_TYPE");
  await assert.rejects(() => ingestFile({ name: "large.txt", mimeType: "text/plain", data: Buffer.alloc(1024 * 1024 + 1, 65) }, { maxFileSizeMb: 1 }), (error) => error instanceof IngestError && error.code === "INGEST_FILE_TOO_LARGE");
  await rejects({ name: "scan.pdf", mimeType: "application/pdf", data: pdf("") }, "INGEST_PDF_NO_TEXT");
  console.log("Rafid secure text and document ingestion tests passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
