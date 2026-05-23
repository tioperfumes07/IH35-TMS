#!/usr/bin/env node
import fs from "node:fs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const servicePath = "apps/backend/src/telematics/arrival-detection.service.ts";
if (!fs.existsSync(servicePath)) {
  throw new Error(`Missing arrival detection service: ${servicePath}`);
}
const service = fs.readFileSync(servicePath, "utf8");
mustInclude(service, "l.operating_company_id = $1::uuid", "load tenant filter");
mustInclude(service, "WHERE operating_company_id = $1::uuid", "arrival tenant filter");
mustInclude(service, "operating_company_id,", "arrival write tenant column");

const routesPath = "apps/backend/src/driver/arrival-prompts.routes.ts";
if (!fs.existsSync(routesPath)) {
  throw new Error(`Missing arrival prompt routes: ${routesPath}`);
}
const routes = fs.readFileSync(routesPath, "utf8");
mustInclude(routes, "set_config('app.operating_company_id'", "driver prompt tenant context");
mustInclude(routes, "a.operating_company_id = $1::uuid", "driver prompt query tenant filter");

console.log("verify-arrival-detection-tenant-scope: ok");
