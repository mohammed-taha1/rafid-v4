"use strict";

const { inspectEnvironment, logEnvironmentIssues } = require("./lib/env");

logEnvironmentIssues(inspectEnvironment());

require("./functions/config");
require("./functions/health");
require("./functions/source");
require("./functions/extract");
require("./functions/opportunity");
require("./functions/assess");
