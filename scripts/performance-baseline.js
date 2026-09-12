"use strict";

const { performance } = require("node:perf_hooks");
const JSZip = require("jszip");
const { ingestFile, ingestText } = require("../src/lib/ingest");

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] * 100) / 100;
}

async function measure(label, action, repeats = 5) {
  const values = [];
  for (let index = 0; index < repeats; index += 1) {
    const started = performance.now();
    await action();
    values.push(performance.now() - started);
  }
  return { label, repeats, median_ms: percentile(values, 0.5), p90_ms: percentile(values, 0.9) };
}

function pdf(pages = 12) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const pageIds = [];
  const fontId = 3 + pages * 2;
  for (let page = 0; page < pages; page += 1) pageIds.push(3 + page * 2);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`);
  for (let page = 1; page <= pages; page += 1) {
    const pageId = 3 + (page - 1) * 2;
    const contentId = pageId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    const stream = `BT /F1 12 Tf 72 720 Td (Rafid benchmark research page ${page} with evidence and methodology) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

async function docx(paragraphs = 250) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const body = Array.from({ length: paragraphs }, (_, index) => `<w:p><w:r><w:t>فقرة قياس ${index + 1} لمنهجية البحث والأثر والأدلة وخطة التنفيذ</w:t></w:r></w:p>`).join("");
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function main() {
  const arabicText = "عنوان البحث\n\n" + "توضح هذه الفقرة المشكلة والمنهجية والأهداف والأثر المتوقع والأدلة. ".repeat(2_000);
  const txt = Buffer.from(arabicText);
  const pdfData = pdf();
  const docxData = await docx();
  const results = [];
  results.push(await measure("direct_text_100k_chars", () => ingestText(arabicText)));
  results.push(await measure("txt_100k_chars", () => ingestFile({ name: "benchmark.txt", mimeType: "text/plain", data: txt })));
  results.push(await measure("pdf_12_pages", () => ingestFile({ name: "benchmark.pdf", mimeType: "application/pdf", data: pdfData })));
  results.push(await measure("docx_250_paragraphs", () => ingestFile({ name: "benchmark.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: docxData })));

  if (process.env.RAFID_PERF_URL) {
    const base = new URL(process.env.RAFID_PERF_URL).origin;
    results.push(await measure("remote_health", async () => {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Health returned ${response.status}`);
      await response.arrayBuffer();
    }, 3));
    results.push(await measure("remote_frontend", async () => {
      const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Frontend returned ${response.status}`);
      await response.arrayBuffer();
    }, 3));
  }

  console.log(JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
