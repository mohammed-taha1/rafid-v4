"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const requiredAssets = [
  "frontend/vendor/mammoth.browser.min.js",
  "frontend/vendor/pdf.min.mjs",
  "frontend/vendor/pdf.worker.min.mjs",
  "frontend/assets/rafid-logo.png",
];

Promise.all(requiredAssets.map((asset) => fs.access(path.join(projectRoot, asset))))
  .then(() => console.log(`Verified ${requiredAssets.length} local browser assets.`))
  .catch((error) => {
    console.error("A required local browser asset is missing.");
    console.error(error.message);
    process.exitCode = 1;
  });
