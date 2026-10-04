#!/usr/bin/env node
import fs from "node:fs";
import { setsTenantGuc, TENANT_GUC_HINT } from "./lib/tenant-guc-match.mjs";

function mustInclude(content, needle, description) {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${description}: ${needle}`);
  }
}

const detectorPath = "apps/backend/src/telematics/geofence-detector.service.ts";
const routesPath = "apps/backend/src/telematics/geofences.routes.ts";
const reportPath = "apps/backend/src/reports/geofence-dwell.routes.ts";
const reportPagePath = "apps/frontend/src/pages/reports/GeofenceDwellReport.tsx";

function assertLive() {
  if (!fs.existsSync(detectorPath)) {
    throw new Error(`Missing detector service: ${detectorPath}`);
  }
  const detector = fs.readFileSync(detectorPath, "utf8");
  mustInclude(detector, "WHERE g.operating_company_id = $1::uuid", "tenant geofence filtering");
  mustInclude(detector, "WHERE ge.operating_company_id = $1::uuid", "tenant event filtering");
  mustInclude(detector, "operating_company_id,", "tenant column write");

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

  if (!fs.existsSync(reportPath)) {
    throw new Error(`Missing geofence dwell report route: ${reportPath}`);
  }
  const report = fs.readFileSync(reportPath, "utf8");
  mustInclude(report, "ev.operating_company_id = $1::uuid", "report tenant filter");

  const reportPage = fs.readFileSync(reportPagePath, "utf8");
  mustInclude(reportPage, '<Combobox', "searchable geofence filter");
  mustInclude(reportPage, 'id="geofence-dwell-filter"', "labelled geofence filter");
  if (/<select[\s\S]*?value=\{geofenceId\}/.test(reportPage)) {
    throw new Error("Geofence dwell filter must not regress to a native UUID-valued select");
  }
  // BANK-F91299 leftover refuse — GeofenceDwellReport.tsx page-scoped text token ratchet
  if (reportPage.includes("text-[11px]")) throw new Error(`${reportPagePath}: leftover text-[11px]`);
  if (reportPage.includes("#8A92AB") || reportPage.includes("#334155")) throw new Error(`${reportPagePath}: leftover off-scale muted`);
}

if (process.argv.includes("--selftest")) {
  // BANK-F91299 leftover plant — GeofenceDwellReport page-scoped text token ratchet
  const leftoverPlant = '<div className="text-[11px] text-[#8A92AB]">plant</div>';
  const leftoverHits = [];
  if (leftoverPlant.includes("text-[11px]")) leftoverHits.push(`${reportPagePath}: leftover text-[11px]`);
  if (leftoverPlant.includes("#8A92AB") || leftoverPlant.includes("#334155")) leftoverHits.push(`${reportPagePath}: leftover off-scale muted`);
  if (!leftoverHits.some((e) => e.includes("leftover text-[11px]")) || !leftoverHits.some((e) => e.includes("leftover off-scale muted"))) {
    console.error("verify-geofence-detector-tenant-scope --selftest FAIL leftover plant escaped", leftoverHits);
    process.exit(1);
  }
  console.log("verify-geofence-detector-tenant-scope --selftest OK (leftover plant)");
  process.exit(0);
}

assertLive();
console.log("verify-geofence-detector-tenant-scope: ok");
