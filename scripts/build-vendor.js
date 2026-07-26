const fs = require("node:fs/promises");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

const source = path.join(projectRoot, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js");
const destination = path.join(projectRoot, "frontend", "vendor", "supabase.min.js");

fs.copyFile(source, destination).catch((error) => {
  console.error("Unable to build the browser Supabase client.");
  console.error(error.message);
  process.exitCode = 1;
});
