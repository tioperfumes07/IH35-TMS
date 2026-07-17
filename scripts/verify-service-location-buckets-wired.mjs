#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/backend/src/maintenance/dashboard.routes.ts");
const source = fs.readFileSync(targetFile, "utf8");

const kpisMarker = 'app.get("/api/v1/maintenance/service-location/kpis"';
const rowsMarker = 'app.get("/api/v1/maintenance/service-location/rows"';
// The rows handler is followed by the parts-inventory KPIs handler; use it to
// bound the rows block. (The maintenance settings GET handler was refactored
// into its own settings.routes.ts and is verified separately below.)
const rowsEndMarker = 'app.get("/api/v1/maintenance/parts-inventory/kpis"';

const kpisStart = source.indexOf(kpisMarker);
const rowsStart = source.indexOf(rowsMarker);
const rowsEnd = source.indexOf(rowsEndMarker);

if (kpisStart < 0 || rowsStart < 0 || rowsEnd < 0) {
  console.error("[verify-service-location-buckets-wired] Missing service-location route handlers");
  process.exit(1);
}

// Settings GET must remain wired (now in its own routes file).
const settingsFile = path.join(repoRoot, "apps/backend/src/maintenance/settings.routes.ts");
const settingsSource = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, "utf8") : "";
if (!settingsSource.includes('app.get("/api/v1/maintenance/settings"')) {
  console.error("[verify-service-location-buckets-wired] Missing GET /api/v1/maintenance/settings handler");
  process.exit(1);
}

const kpisBlock = source.slice(kpisStart, rowsStart);
const rowsBlock = source.slice(rowsStart, rowsEnd);

const bucketFallback =
  "COALESCE(bucket::text,\n              CASE\n                WHEN repair_location = 'mobile_roadside' THEN 'roadside'\n                WHEN repair_location = 'in_house' THEN 'in_house'\n                ELSE 'external'\n              END";

const statusFilter = "status NOT IN ('complete', 'cancelled')";
const legacyStatusFilter = "status IN ('open', 'in_progress', 'waiting_parts')";

function assertBlock(blockName, block) {
  if (!block.includes(statusFilter)) {
    console.error(`[verify-service-location-buckets-wired] ${blockName} missing active status filter: ${statusFilter}`);
    process.exit(1);
  }
  if (block.includes(legacyStatusFilter)) {
    console.error(`[verify-service-location-buckets-wired] ${blockName} still uses legacy status filter`);
    process.exit(1);
  }
  if (!block.includes(bucketFallback)) {
    console.error(`[verify-service-location-buckets-wired] ${blockName} missing bucket fallback COALESCE/CASE`);
    process.exit(1);
  }
}

assertBlock("service-location/kpis", kpisBlock);
assertBlock("service-location/rows", rowsBlock);

console.log("PASS: service-location KPI and rows queries use NOT IN status filter and bucket fallback.");
