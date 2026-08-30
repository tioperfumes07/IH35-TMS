#!/usr/bin/env node
// SAMSARA-UNITS-VIN-COLLISION-500: syncSamsaraVehiclesMaster()'s mdata.units upsert used to look up
// an existing row ONLY by samsara_vehicle_id, so a unit that already existed with the SAME VIN (no
// samsara_vehicle_id link yet) was invisible to it and the code fell through to INSERT, colliding on
// units_vin_key -- an unhandled rejection with no per-row isolation (unlike syncSamsaraTrailersMaster's
// already-proven SAVEPOINT pattern in the same file), so one collision could abort the whole sync.
// Guard requires the units upsert to (a) match by samsara_vehicle_id OR vin, (b) write
// samsara_vehicle_id on the VIN-matched UPDATE branch (linking, not just reading), and (c) isolate the
// row in its own SAVEPOINT/try-catch so a collision only fails that one vehicle.
import fs from "node:fs";

const FILE = "apps/backend/src/integrations/samsara/samsara-master-sync.service.ts";

function inspect(source) {
  const failures = [];

  if (!/WHERE \(samsara_vehicle_id = \$2 OR \(\$3::text IS NOT NULL AND vin = \$3\)\)\s*\n\s*AND COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$1::uuid\s*\n\s*LIMIT 1\s*\n\s*`,\s*\n\s*\[operatingCompanyId, v\.id, vinRaw\]/.test(source)) {
    failures.push("mdata.units existingUnit lookup no longer matches by samsara_vehicle_id OR vin");
  }
  if (!/SET vin = COALESCE\(\$1, vin\),[\s\S]{0,300}samsara_vehicle_id = \$7,/.test(source)) {
    failures.push("mdata.units UPDATE branch no longer writes samsara_vehicle_id (VIN-matched rows would stay unlinked)");
  }
  if (!/await client\.query\("SAVEPOINT unit_row"\);/.test(source) || !/await client\.query\("ROLLBACK TO SAVEPOINT unit_row"\)\.catch/.test(source)) {
    failures.push("mdata.units upsert is no longer SAVEPOINT-isolated per row");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-samsara-units-vin-collision-isolated --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    "WHERE (samsara_vehicle_id = $2 OR ($3::text IS NOT NULL AND vin = $3))\n              AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid\n            LIMIT 1\n          `,\n          [operatingCompanyId, v.id, vinRaw]",
    "WHERE samsara_vehicle_id = $2\n              AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid\n            LIMIT 1\n          `,\n          [operatingCompanyId, v.id]"
  );
  if (mutated === real) {
    console.error("verify-samsara-units-vin-collision-isolated --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-samsara-units-vin-collision-isolated --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-samsara-units-vin-collision-isolated --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-samsara-units-vin-collision-isolated FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-samsara-units-vin-collision-isolated: OK — mdata.units Samsara upsert matches by VIN too and is SAVEPOINT-isolated per row");
