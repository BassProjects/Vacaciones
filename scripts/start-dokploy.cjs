const fs = require("node:fs");
const { validateDeploymentEnvironment } = require("../lib/runtimeConfig.cjs");

try {
  validateDeploymentEnvironment();
} catch (error) {
  // Configuration errors contain variable names only, never their values.
  console.error(`Invalid deployment configuration: ${error.message}`);
  process.exit(1);
}
fs.mkdirSync("/tmp/next-cache", { recursive: true });
require("../server.js");
