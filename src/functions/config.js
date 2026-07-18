"use strict";

const { app } = require("@azure/functions");
const { optionsResponse, jsonResponse } = require("../lib/http");
const { publicRuntimeConfig } = require("../lib/auth");

async function configHandler(request) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  return jsonResponse(request, 200, { ok: true, ...publicRuntimeConfig() });
}

app.http("rafidPublicConfig", {
  route: "rafid/public/config",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: configHandler,
});

module.exports = { configHandler };
