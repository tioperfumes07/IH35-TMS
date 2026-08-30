#!/usr/bin/env node
// SAMSARA-EQUIPMENT-VIN-COLLISION-500: syncSamsaraVehiclesMaster()'s mdata.equipment upsert (a
// separate block from its mdata.units upsert, earlier in the same function) looked up an existing
// row ONLY by samsara_vehicle_id, so equipment that already existed with the SAME VIN (no
// samsara_vehicle_id link yet) was invisible to it and the code fell through to INSERT, colliding on
// equipment_vin_key. This exact bug class was already fixed on the sibling mdata.units block
// (SAMSARA-UNITS-VIN-COLLISION-500, PR #18346) but this block was explicitly flagged, not fixed, in
// that PR pending Sentry evidence -- live-confirmed still firing every cron tick after that PR
// shipped. Guard requires the equipment upsert to (a) match by samsara_vehicle_id OR vin, (b) write
// samsara_vehicle_id on the VIN-matched UPDATE branch (linking, not just reading), and (c) isolate the
// row in its own SAVEPOINT/try-catch so a collision only fails that one vehicle.
import fs from "node:fs";

const FILE = "apps/backend/src/integrations/samsara/samsara-master-sync.service.ts";

function inspect(source) {
  const failures = [];

  if (!/WHERE \(samsara_vehicle_id = \$2 OR \(\$3::text IS NOT NULL AND vin = \$3\)\)\s*\n\s*AND COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$1::uuid\s*\n\s*LIMIT 1\s*\n\s*`,\s*\n\s*\[operatingCompanyId, v\.id, vinRaw\]\s*\n\s*\);\s*\n\s*\n\s*if \(existing\.rows\[0\]\) \{\s*\n\s*const equipId/.test(source)) {
    failures.push("mdata.equipment existing lookup no longer matches by samsara_vehicle_id OR vin");
  }
  if (!/SET vin = COALESCE\(\$1, vin\),[\s\S]{0,300}samsara_vehicle_id = \$7,[\s\S]{0,50}updated_at = now\(\)\s*\n\s*WHERE id = \$8::uuid/.test(source)) {
    failures.push("mdata.equipment UPDATE branch no longer writes samsara_vehicle_id (VIN-matched rows would stay unlinked)");
  }
  if (!/await client\.query\("SAVEPOINT equipment_row"\);/.test(source) || !/await client\.query\("ROLLBACK TO SAVEPOINT equipment_row"\)\.catch/.test(source)) {
    failures.push("mdata.equipment upsert is no longer SAVEPOINT-isolated per row");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-samsara-equipment-vin-collision-isolated --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    'await client.query("SAVEPOINT equipment_row");\n    try {',
    "{"
  ).replace(
    'await client.query("RELEASE SAVEPOINT equipment_row");\n    } catch (e) {\n      await client.query("ROLLBACK TO SAVEPOINT equipment_row").catch(() => {});\n      errors.push(`equipment_upsert_failed:${v.id}:${String((e as Error)?.message ?? e)}`);\n    }',
    "}"
  );
  if (mutated === real) {
    console.error("verify-samsara-equipment-vin-collision-isolated --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-samsara-equipment-vin-collision-isolated --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-samsara-equipment-vin-collision-isolated --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-samsara-equipment-vin-collision-isolated FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-samsara-equipment-vin-collision-isolated: OK — mdata.equipment Samsara upsert matches by VIN too and is SAVEPOINT-isolated per row");
