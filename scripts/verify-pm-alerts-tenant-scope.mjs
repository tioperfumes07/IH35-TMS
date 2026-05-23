#!/usr/bin/env node
import fs from "node:fs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const predictorPath = "apps/backend/src/telematics/maintenance-predictor.service.ts";
if (!fs.existsSync(predictorPath)) {
  throw new Error(`Missing maintenance predictor service: ${predictorPath}`);
}
const predictor = fs.readFileSync(predictorPath, "utf8");
mustInclude(predictor, "WHERE operating_company_id = $1::uuid", "predictor tenant filter");
mustInclude(predictor, "operating_company_id,", "predictor tenant write");

const routesPath = "apps/backend/src/maintenance/pm-alerts.routes.ts";
if (!fs.existsSync(routesPath)) {
  throw new Error(`Missing PM alert routes: ${routesPath}`);
}
const routes = fs.readFileSync(routesPath, "utf8");
mustInclude(routes, "set_config('app.operating_company_id'", "route tenant context");
mustInclude(routes, "a.operating_company_id = $1::uuid", "route query tenant filter");

console.log("verify-pm-alerts-tenant-scope: ok");
