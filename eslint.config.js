const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "frontend/vendor/**",
      "frontend/rafid_v3_1_ai_connected.html",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "scripts/**/*.js", "tests.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    files: ["frontend/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        mammoth: "readonly",
        pdfjsLib: "readonly",
        rafidSupabase: "readonly",
      },
    },
  },
];
