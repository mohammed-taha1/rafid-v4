"use strict";

const { execFileSync } = require("node:child_process");
const { readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const targets = [
  join(root, "src"),
  join(root, "frontend"),
  join(root, "scripts", "run-rafid.js"),
  join(root, "scripts", "sdk-contract-test.js"),
  join(root, "scripts", "auth-test.js"),
  join(root, "scripts", "env-test.js"),
  join(root, "scripts", "check-js.js"),
  join(root, "tests.js"),
];

function collect(path) {
  if (statSync(path).isFile()) return path.endsWith(".js") ? [path] : [];
  return readdirSync(path).flatMap((name) => collect(join(path, name)));
}

const files = targets.flatMap(collect);
for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
