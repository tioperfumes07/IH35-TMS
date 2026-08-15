#!/usr/bin/env node
/**
 * MAINT-F3520 — Vehicles Master Data keeps server-bound search;
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "VehiclesMasterDataPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "VehiclesMasterDataPage: must keep server-bound search");
  assert(/listMaintenanceVehicles\([^)]*\{\s*search\s*\}/.test(src), "VehiclesMasterDataPage: must pass search to listMaintenanceVehicles");
  assert(/suppressToolbarSearch/.test(src), "VehiclesMasterDataPage: must pass suppressToolbarSearch");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(/\n\s*\/\/ MAINT-F3520:[^\n]*\n\s*suppressToolbarSearch\n/, "\n");
  assert(!/suppressToolbarSearch/.test(bad), "selftest fixture must remove all suppressToolbarSearch tokens");
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-vehicles-master-data-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-vehicles-master-data-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-vehicles-master-data-suppress-toolbar-search PASS — vehicles master data suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-vehicles-master-data-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
