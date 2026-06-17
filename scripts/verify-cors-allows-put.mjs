#!/usr/bin/env node
// Guard: the @fastify/cors methods list MUST include PUT. The browser blocks any PUT whose CORS preflight
// omits PUT from Access-Control-Allow-Methods ("Failed to fetch / method not allowed"). PUT endpoints
// exist (e.g. PUT /api/v1/forecast/opening-balance, PUT /api/v1/accounting/cash-forecast/settings) and
// were silently browser-blocked until PUT was added. Regressing this re-breaks every PUT save.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-cors-allows-put: ${m}`); process.exit(1); };
const src = readFileSync(join(root, "apps/backend/src/index.ts"), "utf8");
const m = src.match(/methods:\s*\[([^\]]*)\]/);
if (!m) fail("could not find the CORS methods list in index.ts");
const methods = m[1];
for (const verb of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
  if (!new RegExp(`"${verb}"`).test(methods)) fail(`CORS methods must include "${verb}" — found: [${methods.trim()}]`);
}
console.log("PASS verify-cors-allows-put");
