#!/usr/bin/env node
import fs from "node:fs";

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
mustInclude(service, "WHERE d.operating_company_id = $1::uuid", "driver tenant filter");
mustInclude(service, "COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = $1::uuid", "equipment tenant filter");
mustInclude(service, "WHERE operating_company_id = $1::uuid", "assignment tenant filter");
mustInclude(service, "operating_company_id,", "assignment tenant writes");

const routesPath = "apps/backend/src/telematics/vehicle-driver-pairing.routes.ts";
if (!fs.existsSync(routesPath)) {
  throw new Error(`Missing routes file: ${routesPath}`);
}
const routes = fs.readFileSync(routesPath, "utf8");
mustInclude(routes, "set_config('app.operating_company_id'", "route tenant context");
mustInclude(routes, "a.operating_company_id = $1::uuid", "history query tenant filter");

console.log("verify-vehicle-driver-pairing-tenant-scope: ok");
