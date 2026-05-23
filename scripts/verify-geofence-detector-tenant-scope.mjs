#!/usr/bin/env node
import fs from "node:fs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const detectorPath = "apps/backend/src/telematics/geofence-detector.service.ts";
if (!fs.existsSync(detectorPath)) {
  throw new Error(`Missing detector service: ${detectorPath}`);
}
const detector = fs.readFileSync(detectorPath, "utf8");
mustInclude(detector, "WHERE g.operating_company_id = $1::uuid", "tenant geofence filtering");
mustInclude(detector, "WHERE ge.operating_company_id = $1::uuid", "tenant event filtering");
mustInclude(detector, "operating_company_id,", "tenant column write");

const routesPath = "apps/backend/src/telematics/geofences.routes.ts";
if (!fs.existsSync(routesPath)) {
  throw new Error(`Missing geofence routes: ${routesPath}`);
}
const routes = fs.readFileSync(routesPath, "utf8");
mustInclude(routes, "set_config('app.operating_company_id'", "route tenant context");

const reportPath = "apps/backend/src/reports/geofence-dwell.routes.ts";
if (!fs.existsSync(reportPath)) {
  throw new Error(`Missing geofence dwell report route: ${reportPath}`);
}
const report = fs.readFileSync(reportPath, "utf8");
mustInclude(report, "ev.operating_company_id = $1::uuid", "report tenant filter");

console.log("verify-geofence-detector-tenant-scope: ok");
