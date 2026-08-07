#!/usr/bin/env node
import fs from "node:fs";
import { setsTenantGuc, TENANT_GUC_HINT } from "./lib/tenant-guc-match.mjs";

const servicePath = "apps/backend/src/telematics/vehicle-locations.service.ts";
const routesPath = "apps/backend/src/telematics/positions.routes.ts";
const service = fs.readFileSync(servicePath, "utf8");
const routes = fs.readFileSync(routesPath, "utf8");

const required = [
  "ON CONFLICT (operating_company_id, raw_samsara_event_id) DO NOTHING",
  "operating_company_id",
  "WHERE operating_company_id = $1::uuid",
];

const missing = required.filter((snippet) => !service.includes(snippet) && !routes.includes(snippet));

// CLS-GUARD-LITERAL-GUC: this was a fourth literal in the list above, `set_config('app.operating_company_id'`.
// Keying on that exact call meant the guard went RED when positions.routes.ts adopted
// setScopedCompanyContext — which sets the SAME GUC and asserts company membership first, i.e. strictly
// stronger. A guard that fails the safer form teaches people to revert to the unsafe one. The property
// is "one of these two files sets the tenant GUC", so that is what is asserted.
if (!setsTenantGuc(service) && !setsTenantGuc(routes)) {
  missing.push(`a tenant GUC set — ${TENANT_GUC_HINT}`);
}

if (missing.length > 0) {
  console.error("verify-vehicle-locations-tenant-scope failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}

console.log("verify-vehicle-locations-tenant-scope: ok");
