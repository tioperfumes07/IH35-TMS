#!/usr/bin/env node
import fs from "node:fs";
import { setsTenantGuc, TENANT_GUC_HINT } from "./lib/tenant-guc-match.mjs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const servicePath = "apps/backend/src/telematics/vehicle-driver-lookup.service.ts";
if (!fs.existsSync(servicePath)) {
  throw new Error(`Missing service file: ${servicePath}`);
}
const service = fs.readFileSync(servicePath, "utf8");
mustInclude(service, "d.operating_company_id = $1::uuid", "driver home-company tenant filter");
mustInclude(service, "FROM mdata.driver_company_authorizations webhook_pairing_driver_dca", "shared-driver authorization source");
mustInclude(service, "webhook_pairing_driver_dca.company_id = $1::uuid", "shared-driver company filter");
mustInclude(service, "webhook_pairing_driver_dca.is_authorized = true", "active shared-driver authorization filter");
mustInclude(service, "webhook_pairing_driver_dca.deactivated_at IS NULL", "non-deactivated shared-driver authorization filter");
mustInclude(service, "COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = $1::uuid", "equipment tenant filter");
mustInclude(service, "WHERE operating_company_id = $1::uuid", "assignment tenant filter");
mustInclude(service, "operating_company_id,", "assignment tenant writes");

const routesPath = "apps/backend/src/telematics/vehicle-driver-pairing.routes.ts";
if (!fs.existsSync(routesPath)) {
  throw new Error(`Missing routes file: ${routesPath}`);
}
const routes = fs.readFileSync(routesPath, "utf8");
// CLS-GUARD-LITERAL-GUC: assert the PROPERTY (this file sets the tenant GUC), not one exact call.
// setScopedCompanyContext sets the same GUC AND asserts company membership first — strictly
// stronger — so a literal grep failed the route for being made safer.
if (!setsTenantGuc(routes)) {
  throw new Error(`Missing route tenant context in apps/backend/src/telematics/vehicle-driver-pairing.routes.ts — ${TENANT_GUC_HINT}`);
}
mustInclude(routes, "a.operating_company_id = $1::uuid", "history query tenant filter");

console.log("verify-vehicle-driver-pairing-tenant-scope: ok");
