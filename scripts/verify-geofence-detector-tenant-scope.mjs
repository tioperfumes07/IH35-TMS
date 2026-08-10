#!/usr/bin/env node
import fs from "node:fs";
import { setsTenantGuc, TENANT_GUC_HINT } from "./lib/tenant-guc-match.mjs";

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
// CLS-GUARD-LITERAL-GUC: assert the PROPERTY (this file sets the tenant GUC), not one exact call.
// setScopedCompanyContext sets the same GUC AND asserts company membership first — strictly
// stronger — so a literal grep failed the route for being made safer.
if (!setsTenantGuc(routes)) {
  throw new Error(`Missing route tenant context in apps/backend/src/telematics/geofences.routes.ts — ${TENANT_GUC_HINT}`);
}

const reportPath = "apps/backend/src/reports/geofence-dwell.routes.ts";
if (!fs.existsSync(reportPath)) {
  throw new Error(`Missing geofence dwell report route: ${reportPath}`);
}
const report = fs.readFileSync(reportPath, "utf8");
mustInclude(report, "ev.operating_company_id = $1::uuid", "report tenant filter");

const reportPagePath = "apps/frontend/src/pages/reports/GeofenceDwellReport.tsx";
const reportPage = fs.readFileSync(reportPagePath, "utf8");
mustInclude(reportPage, '<Combobox', "searchable geofence filter");
mustInclude(reportPage, 'id="geofence-dwell-filter"', "labelled geofence filter");
if (/<select[\s\S]*?value=\{geofenceId\}/.test(reportPage)) {
  throw new Error("Geofence dwell filter must not regress to a native UUID-valued select");
}

console.log("verify-geofence-detector-tenant-scope: ok");
