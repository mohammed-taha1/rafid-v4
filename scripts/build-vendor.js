"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");

const projectRoot = path.resolve(__dirname, "..");
const requiredAssets = [
  "frontend/vendor/mammoth.browser.min.js",
  "frontend/vendor/pdf.min.mjs",
  "frontend/vendor/pdf.worker.min.mjs",
  "frontend/assets/rafid-logo.png",
];

async function build() {
  await Promise.all(requiredAssets.map((asset) => fs.access(path.join(projectRoot, asset))));
  await esbuild.build({
    stdin: {
      contents: 'export { createClient } from "@supabase/supabase-js";',
      resolveDir: projectRoot,
      sourcefile: "rafid-supabase-auth-entry.js",
    },
    outfile: path.join(projectRoot, "frontend", "vendor", "supabase-auth.min.mjs"),
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    legalComments: "none",
  });
  const authBundlePath = path.join(projectRoot, "frontend", "vendor", "supabase-auth.min.mjs");
  const authBundle = await fs.readFile(authBundlePath, "utf8");
  await fs.writeFile(authBundlePath, authBundle.replace(/[\t ]+$/gm, ""));
  console.log(`Verified ${requiredAssets.length} local browser assets and built the Supabase auth client.`);
}

build().catch((error) => {
    console.error("A required local browser asset is missing.");
    console.error(error.message);
    process.exitCode = 1;
  });
