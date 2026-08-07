#!/usr/bin/env node
import fs from "node:fs";
import { setsTenantGuc, TENANT_GUC_HINT } from "./lib/tenant-guc-match.mjs";

const target = "apps/backend/src/telematics/driver-day-summary.routes.ts";
const src = fs.readFileSync(target, "utf8");
const required = [
  "WHERE v.operating_company_id = $1::uuid",
  "WHERE e.operating_company_id = $1::uuid",
  "WHERE ft.operating_company_id = $1::uuid",
  "WHERE sa.operating_company_id = $1::uuid",
];
const missing = required.filter((snippet) => !src.includes(snippet));
// CLS-GUARD-LITERAL-GUC: assert the PROPERTY (this file sets the tenant GUC), not one exact
// call. setScopedCompanyContext sets the same GUC AND asserts company membership first —
// strictly stronger — so a literal grep failed a route for being made safer.
if (!setsTenantGuc(src)) missing.push(`a tenant GUC set — ${TENANT_GUC_HINT}`);
if (missing.length > 0) {
  console.error("verify-day-summary-tenant-scope failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}
console.log("verify-day-summary-tenant-scope: ok");
