#!/usr/bin/env node
/**
 * DRV-14 guard (owner 2026-09-05): Driver Qualification File report page.
 * Asserts:
 *   1. Backend endpoint /api/v1/safety/driver-qualification/roster exists
 *   2. Frontend report page exists at pages/reports/DriverQualificationReportPage.tsx
 *   3. Route is wired in manifest.tsx
 *   4. Sub-nav link exists in ReportsSubNav.tsx
 *   5. Page uses ParityTable with storageKey
 *   6. Dates use MMM-DD format (formatPlannerDayLabel)
 *   7. Active-only default (include_inactive defaults to false)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

// 1. Backend endpoint
const routes = read("apps/backend/src/safety/driver-qualification.routes.ts");
if (!routes.includes("/api/v1/safety/driver-qualification/roster")) {
  failures.push("driver-qualification.routes.ts: missing /roster endpoint");
}
if (!routes.includes("cdl_number") || !routes.includes("cdl_expiry_date")) {
  failures.push("driver-qualification.routes.ts: roster must include CDL fields");
}
if (!routes.includes("dot_medical_expiry")) {
  failures.push("driver-qualification.routes.ts: roster must include DOT medical expiry");
}
if (!routes.includes("mvr_expiry")) {
  failures.push("driver-qualification.routes.ts: roster must include MVR expiry");
}
if (!routes.includes("clearinghouse_expiry")) {
  failures.push("driver-qualification.routes.ts: roster must include Clearinghouse expiry");
}
if (!routes.includes("include_inactive") || !routes.includes("Active'::mdata.driver_status")) {
  failures.push("driver-qualification.routes.ts: roster must default to active drivers only (include_inactive param)");
}

// 2. Frontend page
const page = read("apps/frontend/src/pages/reports/DriverQualificationReportPage.tsx");
if (!page.includes("ParityTable")) {
  failures.push("DriverQualificationReportPage.tsx: must use ParityTable");
}
if (!page.includes("storageKey")) {
  failures.push("DriverQualificationReportPage.tsx: must have storageKey (gear)");
}
if (!page.includes("formatPlannerDayLabel")) {
  failures.push("DriverQualificationReportPage.tsx: must use formatPlannerDayLabel for MMM-DD dates");
}
if (!page.includes("getDriverQualificationRoster")) {
  failures.push("DriverQualificationReportPage.tsx: must call getDriverQualificationRoster API");
}
if (!page.includes("getDriverQualificationSummary")) {
  failures.push("DriverQualificationReportPage.tsx: must show DQF summary KPIs");
}

// 3. Route in manifest
const manifest = read("apps/frontend/src/routes/manifest.tsx");
if (!manifest.includes("DriverQualificationReportPage")) {
  failures.push("manifest.tsx: missing DriverQualificationReportPage import/route");
}
if (!manifest.includes('path="/reports/driver-qualification"')) {
  failures.push("manifest.tsx: missing /reports/driver-qualification route");
}

// 4. Sub-nav
const subNav = read("apps/frontend/src/pages/reports/ReportsSubNav.tsx");
if (!subNav.includes("/reports/driver-qualification")) {
  failures.push("ReportsSubNav.tsx: missing Driver Qualification File link");
}

// 5. API function
const safetyApi = read("apps/frontend/src/api/safety.ts");
if (!safetyApi.includes("getDriverQualificationRoster")) {
  failures.push("api/safety.ts: missing getDriverQualificationRoster function");
}
if (!safetyApi.includes("DqfRosterDriver")) {
  failures.push("api/safety.ts: missing DqfRosterDriver type");
}

if (failures.length) {
  console.error("FAIL verify-drv14-dqf-report:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-drv14-dqf-report — Driver Qualification File report page (DRV-14): roster endpoint, ParityTable, MMM-DD dates, active-only default, sub-nav wired");
