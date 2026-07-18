"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const frontend = path.join(root, "frontend");
const html = fs.readFileSync(path.join(frontend, "index.html"), "utf8");
const app = fs.readFileSync(path.join(frontend, "rafid-v4.js"), "utf8");
const legacy = fs.readFileSync(path.join(frontend, "rafid_v3_1_ai_connected.html"), "utf8");
const httpHelpers = fs.readFileSync(path.join(root, "src", "lib", "http.js"), "utf8");

const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
assert.deepEqual(duplicates, [], `Duplicate HTML ids: ${duplicates.join(", ")}`);

const declaredIds = new Set(
  [...`${html}\n${app}`.matchAll(/\bid=[\\"]+([^"\\]+)[\\"]+/g)].map((match) => match[1]),
);
const referencedIds = new Set(
  [...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]),
);
const missingIds = [...referencedIds].filter((id) => !declaredIds.has(id));
assert.deepEqual(missingIds, [], `Selectors without declared ids: ${missingIds.join(", ")}`);

for (const match of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
  const reference = match[1];
  assert.ok(!/^https?:/i.test(reference), `Runtime external asset is not allowed: ${reference}`);
  if (!reference.startsWith("data:")) {
    assert.ok(fs.existsSync(path.join(frontend, reference)), `Missing frontend asset: ${reference}`);
  }
}
for (const reference of ["vendor/pdf.min.mjs", "vendor/pdf.worker.min.mjs"]) {
  assert.ok(fs.existsSync(path.join(frontend, reference)), `Missing local PDF asset: ${reference}`);
  assert.match(app, new RegExp(reference.replaceAll(".", "\\.")), `PDF asset is not referenced: ${reference}`);
}

assert.doesNotMatch(html + app, /sk-[A-Za-z0-9_-]{20,}/, "Potential API secret embedded in frontend.");
assert.doesNotMatch(html + app, /gsk_[A-Za-z0-9_-]{20,}/, "Potential Groq API secret embedded in frontend.");
assert.match(html, /lang="ar"\s+dir="rtl"/, "Arabic RTL metadata is required.");
assert.match(html, /id="privacyModal"/, "Privacy gateway is required.");
assert.match(html, /id="authGate"/, "Persistent account sign-in gate is required.");
assert.match(html, /data-auth-provider="google"/, "Google sign-in is required.");
assert.match(html, /data-auth-provider="azure"/, "Microsoft sign-in is required.");
assert.match(html, /id="emailAuthForm"/, "Passwordless email sign-in is required.");
assert.match(html, /vendor\/supabase\.min\.js/, "Local Supabase client bundle is required.");
assert.match(html, /id="serverProviderPanel"/, "Server-managed provider status is required.");
assert.match(html, /value="groq" selected/, "Groq free ZDR path should be the default quick setup.");
assert.match(app, /openai\/gpt-oss-120b/, "Groq GPT-OSS 120B default model is required.");
assert.match(app, /persistSession:\s*true/, "Authentication sessions must persist.");
assert.match(app, /autoRefreshToken:\s*true/, "Authentication sessions must refresh automatically.");
assert.match(app, /rafid_workspaces/, "Per-user workspace sync is required.");
assert.match(
  httpHelpers,
  /Access-Control-Allow-Headers[^\n]+Authorization/,
  "Cross-origin deployments must allow the Supabase bearer token header.",
);
assert.doesNotMatch(html + app, /service[_-]?role/i, "A Supabase service-role secret must never enter the frontend.");
assert.match(app, /classification === "restricted"/, "Restricted-data remote block is required.");
assert.doesNotMatch(
  legacy,
  /<(?:script|link)[^>]+(?:src|href)="https?:|workerSrc="https?:/i,
  "Legacy frontend must not load executable runtime assets from external origins.",
);
for (const reference of [
  "vendor/pdf-legacy-bridge.mjs",
  "vendor/mammoth.browser.min.js",
  "vendor/pdf.worker.min.mjs",
]) {
  assert.ok(fs.existsSync(path.join(frontend, reference)), `Missing legacy local asset: ${reference}`);
}

console.log("Rafid static UI audit passed: auth, persistent session, local assets, RTL, privacy, and secret scan.");
