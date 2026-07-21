#!/usr/bin/env node
// verify-coa-roles-routes-mounted (block-35 SHELL fix)
//
// The Block-35 chart-of-accounts-role API routes (GET/PUT /api/v1/accounting/coa-roles,
// GET /api/v1/accounting/coa-roles/validate) were fully built in
// apps/backend/src/accounting/coa-roles/routes.ts, backed by the real designation table
// accounting.chart_of_accounts_roles, but registerCoaRolesRoutes was NEVER invoked in
// index.ts — the routes were dark (unreachable) in production, so CoaRolesPage.tsx hit a
// dead endpoint. This guard makes the "built but never mounted" regression impossible:
// index.ts must both IMPORT and INVOKE the registrar (an import alone is not wiring).
//
// Self-test: --selftest proves the guard FAILS when the invocation is dropped.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = "apps/backend/src/index.ts";
const REQUIRED = ["registerCoaRolesRoutes"];

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
  const good = 'import { registerCoaRolesRoutes } from "./accounting/coa-roles/routes.js";\nawait registerCoaRolesRoutes(app);';
  const bad = good.replace("await registerCoaRolesRoutes(app);", "");
  if (check(good).length !== 0) { console.error("selftest FAIL: valid sample flagged"); process.exit(1); }
  if (check(bad).length === 0) { console.error("selftest FAIL: planted regression not caught"); process.exit(1); }
  console.log("selftest OK");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, INDEX), "utf8");
const missing = check(src);
if (missing.length) {
  console.error("FAIL: coa-roles routes not mounted in index.ts -> " + missing.join(", "));
  process.exit(1);
}
console.log("OK: registerCoaRolesRoutes is imported and invoked in index.ts");
