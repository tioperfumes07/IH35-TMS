#!/usr/bin/env node
// verify-compliance-routes-mounted (W3B forced-driver-ack + W4A signed-safety-docs)
//
// Both route modules were fully built + migrated (safetydoc.* / driveralert.* schemas with ih35_app
// grants) but registerSafetyDocRoutes / registerDriverAlertRoutes were NEVER invoked in index.ts —
// the routes were dark (unreachable) in production. These are DOT/FMCSA compliance surfaces (driver
// must acknowledge blocking alerts; drivers must read+sign safety docs), so a dark route is a
// compliance-evidence gap. This guard makes the "built but never mounted" regression impossible:
// index.ts must both IMPORT and INVOKE each registrar (an import alone is not wiring).
//
// Self-test: --selftest proves the guard FAILS when an invocation is dropped.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = "apps/backend/src/index.ts";
const REQUIRED = ["registerSafetyDocRoutes", "registerDriverAlertRoutes"];

function check(src) {
  const missing = [];
  for (const fn of REQUIRED) {
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b`).test(src);
    const invoked = new RegExp(`await\\s+${fn}\\s*\\(\\s*app\\s*\\)`).test(src);
    if (!(imported && invoked)) {
      missing.push(`${fn}${imported ? "" : " [not imported]"}${invoked ? "" : " [not invoked]"}`);
    }
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  const good = 'import { registerSafetyDocRoutes } from "a";\nimport { registerDriverAlertRoutes } from "b";\nawait registerSafetyDocRoutes(app);\nawait registerDriverAlertRoutes(app);';
  const bad = good.replace("await registerDriverAlertRoutes(app);", "");
  if (check(good).length !== 0) { console.error("selftest FAIL: valid sample flagged"); process.exit(1); }
  if (check(bad).length === 0) { console.error("selftest FAIL: planted regression not caught"); process.exit(1); }
  console.log("selftest OK");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, INDEX), "utf8");
const missing = check(src);
if (missing.length) {
  console.error("FAIL: compliance routes not mounted in index.ts -> " + missing.join(", "));
  process.exit(1);
}
console.log("OK: registerSafetyDocRoutes + registerDriverAlertRoutes are imported and invoked in index.ts");
