#!/usr/bin/env node
/** FLEET-F6479 — Fleet bulk toolbar controls use shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/components/fleet/BulkActionBar.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to FleetBulkControls");
  for (const id of ["fleet-bulk-status", "fleet-bulk-vehicle-type", "fleet-bulk-trailer-type"]) {
    if (!source.includes(`htmlFor="${id}"`) || !source.includes(`id="${id}"`)) {
      throw new Error(`missing associated Fleet bulk control ${id}`);
    }
  }
  for (const token of [
    'if (status) payload.status = status',
    'if (vehicleType) payload.vehicle_type = vehicleType',
    'if (trailerType) payload.equipment_type = trailerType',
    'options={FLEET_BULK_STATUS_OPTIONS.map',
    'options={typeOptions.map',
    'options={TRAILER_EQUIPMENT_TYPE_OPTIONS.map',
  ]) {
    if (!source.includes(token)) throw new Error(`missing Fleet bulk payload/control contract: ${token}`);
  }
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace('if (trailerType) payload.equipment_type = trailerType', 'if (trailerType) payload.vehicle_type = trailerType');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, FLEET_F6479_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted trailer payload miswire stayed green");
  console.log("verify-fleet-bulk-controls-comboboxes --selftest PASS");
  process.exit(0);
}

assertContract(process.env.FLEET_F6479_PLANTED_SOURCE ?? diskSource);
console.log("verify-fleet-bulk-controls-comboboxes PASS — 3 associated Comboboxes preserve bulk Apply payloads");
