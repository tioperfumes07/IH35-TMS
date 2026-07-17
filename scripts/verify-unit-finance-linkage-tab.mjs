#!/usr/bin/env node
/**
 * verify-unit-finance-linkage-tab.mjs
 *
 * Block 0441-mod13-equipment-no-loan-lease-depreciatio — static wiring guard (no DB):
 *  - READ-ONLY GET /api/v1/mdata/units/:id/finance-linkage route + service exist
 *  - UnitDetail finance tab renders drill-through to fixed-assets / finance-hub / equipment-loans
 *  - Route registered via units.routes.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-finance-linkage-tab";
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`MISSING ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const service = read("apps/backend/src/mdata/unit-finance-linkage.service.ts");
const routes = read("apps/backend/src/mdata/unit-finance-linkage.routes.ts");
const unitsRoutes = read("apps/backend/src/mdata/units.routes.ts");
const unitDetail = read("apps/frontend/src/pages/units/UnitDetail.tsx");
const tab = read("apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx");
const api = read("apps/frontend/src/api/unit-finance-linkage.ts");

if (service) {
  if (!/accounting\.fixed_assets/.test(service)) failures.push("service must query accounting.fixed_assets");
  if (!/accounting\.lease_asset_line/.test(service)) failures.push("service must query accounting.lease_asset_line");
  if (!/banking\.equipment_loans/.test(service)) failures.push("service must query banking.equipment_loans");
  if (/\b(INSERT INTO|UPDATE\s+\w|DELETE FROM)\b/i.test(service)) {
    failures.push("service must be READ-ONLY (no SQL writes)");
  }
}

if (routes) {
  if (!/\/api\/v1\/mdata\/units\/:id\/finance-linkage/.test(routes)) {
    failures.push("routes must expose GET /api/v1/mdata/units/:id/finance-linkage");
  }
}

if (unitsRoutes && !/registerUnitFinanceLinkageRoutes/.test(unitsRoutes)) {
  failures.push("units.routes.ts must register registerUnitFinanceLinkageRoutes");
}

if (unitDetail) {
  if (!/UnitFinanceLinkageTab/.test(unitDetail)) failures.push("UnitDetail must import UnitFinanceLinkageTab");
  if (!/tab === "finance"/.test(unitDetail)) failures.push("UnitDetail must honor ?tab=finance");
  if (!/activeTab === "finance"/.test(unitDetail)) failures.push("UnitDetail must render finance tab");
}

if (tab) {
  if (!/\/accounting\/fixed-assets/.test(tab)) failures.push("tab must link to /accounting/fixed-assets");
  if (!/\/factoring\/equipment-loans/.test(tab)) failures.push("tab must link to /factoring/equipment-loans");
  if (!/\/finance\/hub/.test(tab)) failures.push("tab must link to /finance/hub for leases");
  if (!/data-testid="unit-finance-linkage-tab"/.test(tab)) failures.push("tab must expose data-testid");
}

if (api && !/finance-linkage/.test(api)) {
  failures.push("frontend api must call finance-linkage endpoint");
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — unit finance linkage tab + read-only route wired`);
process.exit(0);
