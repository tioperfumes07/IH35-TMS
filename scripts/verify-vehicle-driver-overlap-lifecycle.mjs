#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  producer: "apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.ts",
  route: "apps/backend/src/telematics/vehicle-driver-pairing.routes.ts",
  api: "apps/frontend/src/api/vehicleDriverPairing.ts",
  surface: "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx",
  unitProfile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  driverProfile: "apps/frontend/src/pages/DriverDetail.tsx",
};

const REQUIRED = {
  producer: ["telematics.vehicle_driver_pairing_overlap_flags", "overlap_started_at", "overlap_ended_at"],
  route: [
    'app.get("/api/v1/telematics/vehicle-driver-overlaps"',
    'app.post("/api/v1/telematics/vehicle-driver-overlaps/:id/resolve"',
    'flag.operating_company_id = $1::uuid',
    'flag.unit_id_a = $',
    'flag.unit_id_b = $',
    'overlap_dca.is_authorized = true',
    'overlap_dca.deactivated_at IS NULL',
    'flag.detected_at::text',
    'flag.resolved_at::text',
    'AND operating_company_id = $2::uuid',
    'AND resolved_at IS NULL',
    'telematics.vehicle_driver_overlap_resolved',
    'vehicle_driver_overlap_not_open',
  ],
  api: ["listVehicleDriverOverlaps", "resolveVehicleDriverOverlap", 'status?: "open" | "resolved" | "all"'],
  surface: [
    'data-testid="vehicle-driver-overlaps"',
    'kind="driver"',
    'kind="unit"',
    'label: "Detected"',
    'label: "Status"',
    '>Resolve</Button>',
    'role="alert"',
    "No overlapping driver assignments found.",
  ],
  unitProfile: ["<UnitDriverHistoryStrip", "operatingCompanyId={companyId}", "unitId={id}"],
  driverProfile: ["<UnitDriverHistoryStrip", "operatingCompanyId={driver.operating_company_id}", "driverId={driver.id}"],
};

function verify(sources) {
  const missing = [];
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) if (!sources[name].includes(token)) missing.push(`${name}: ${token}`);
  }
  return missing;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([name, rel]) => [name, readFileSync(join(ROOT, rel), "utf8")]));
if (process.argv.includes("--selftest")) {
  let mutations = 0;
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) {
      const mutant = { ...sources, [name]: sources[name].replaceAll(token, "__PLANTED_REMOVED__") };
      if (verify(mutant).length === 0) throw new Error(`planted removal survived: ${name}: ${token}`);
      mutations += 1;
    }
  }
  console.log(`verify-vehicle-driver-overlap-lifecycle --selftest PASS ${mutations}/${mutations}`);
  process.exit(0);
}

const missing = verify(sources);
if (missing.length) {
  console.error(`verify-vehicle-driver-overlap-lifecycle FAIL\n${missing.map((item) => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-vehicle-driver-overlap-lifecycle PASS — detected overlaps list, resolve, audit, and drill both ways");
