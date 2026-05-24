import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export default {
  script: "scripts/verify-guards/verify-accounting-routes-autoload.mjs",
  label: "verify-accounting-routes-autoload",
};

function run() {
  const indexPath = path.resolve("apps/backend/src/accounting/index.ts");
  const source = fs.readFileSync(indexPath, "utf8");
  if (/await\s+register[A-Za-z0-9_]*Routes\s*\(\s*app\s*\)/.test(source)) {
    console.error("verify-accounting-routes-autoload: inline register*Routes(app) calls are not allowed.");
    process.exit(1);
  }
  if (!/app\.register\s*\(\s*autoload\s*,/.test(source)) {
    console.error("verify-accounting-routes-autoload: accounting index.ts must register @fastify/autoload.");
    process.exit(1);
  }
  console.log("verify-accounting-routes-autoload: ok");
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  run();
}
