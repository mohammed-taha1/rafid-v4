"use strict";

const dns = require("node:dns").promises;
const net = require("node:net");

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  const normalized = String(address).toLowerCase();
  if (!net.isIPv6(normalized)) return true;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function assertPublicUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    const error = new Error("الرابط الرسمي غير صالح.");
    error.statusCode = 400;
    throw error;
  }
  if (url.protocol !== "https:") {
    const error = new Error("جلب المصادر التلقائي يقبل روابط HTTPS العامة فقط.");
    error.statusCode = 400;
    throw error;
  }
  if (url.username || url.password) {
    const error = new Error("لا يُسمح ببيانات دخول داخل رابط المصدر.");
    error.statusCode = 400;
    throw error;
  }
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    const error = new Error("لا يمكن جلب رابط داخلي أو خاص.");
    error.statusCode = 400;
    error.code = "RAFID_PRIVATE_URL_BLOCKED";
    throw error;
  }
  return url;
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function readableHtml(html) {
  const title = decodeEntities(
    String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "",
  )
    .replace(/\s+/g, " ")
    .trim();
  const text = decodeEntities(
    String(html)
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|canvas|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return { title, text };
}

async function fetchPublicSource(value) {
  let current = await assertPublicUrl(value);
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1",
        "User-Agent": "Rafid/4.3 opportunity-source-reader",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 4) throw new Error("تعذر اتباع تحويلات رابط المصدر.");
      current = await assertPublicUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) {
      const error = new Error(`تعذر قراءة المصدر الرسمي (HTTP ${response.status}).`);
      error.statusCode = 502;
      throw error;
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!/(text\/html|text\/plain|application\/json)/.test(contentType)) {
      const error = new Error("هذا الرابط ليس صفحة نصية. نزّل الدليل وارفع PDF أو DOCX إلى رافد.");
      error.statusCode = 422;
      throw error;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > 2_000_000) {
        const error = new Error("صفحة المصدر أكبر من حد الجلب التلقائي (2MB).");
        error.statusCode = 413;
        throw error;
      }
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsed = contentType.includes("text/html")
      ? readableHtml(raw)
      : { title: "", text: raw.trim() };
    if (parsed.text.length < 100) {
      const error = new Error("لم نجد نصًا كافيًا في الصفحة؛ قد تكون ديناميكية أو محمية. الصق النص أو ارفع الدليل.");
      error.statusCode = 422;
      throw error;
    }
    return {
      final_url: current.href,
      title: parsed.title || null,
      text: parsed.text.slice(0, 500_000),
      truncated: parsed.text.length > 500_000,
    };
  }
  throw new Error("تعذر قراءة المصدر الرسمي.");
}

module.exports = { assertPublicUrl, fetchPublicSource, isPrivateAddress, readableHtml };
