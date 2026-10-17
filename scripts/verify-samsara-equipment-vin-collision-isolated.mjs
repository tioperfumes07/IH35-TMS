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

// REPOINTED (ROUND 443.187): 715c5b809a "Claude-3- Samsara master sync link-only (0 failures, 0
// creates) + canonical driver map in every CC-3 engine (#23690)" (LEAD DECISION 2026-10-01, guarded
// by verify-samsara-master-sync-link-only.mjs: "vehicles never write mdata.equipment (trucks are not
// trailers)") MOVED the mdata.equipment write out of syncSamsaraVehiclesMaster() into
// syncSamsaraTrailersMaster(), and made it link-only: the lookup matches GLOBALLY (VIN is globally
// unique) by samsara_vehicle_id OR vin (OR equipment_number), a row owned by another company is
// SKIPPED in code (other_company), the UPDATE links samsara_vehicle_id fill-empty, and the per-row
// SAVEPOINT is now `trailer_row`. Same three rules, asserted on the block that now owns the write.
function inspect(source) {
  const failures = [];
  const startIdx = source.indexOf("export async function syncSamsaraTrailersMaster(");
  const block = startIdx >= 0 ? source.slice(startIdx) : "";
  if (!block) failures.push("syncSamsaraTrailersMaster() (owner of the mdata.equipment write) not found");

  if (!/FROM mdata\.equipment\s*\n\s*WHERE samsara_vehicle_id = \$1 OR \(\$2::text IS NOT NULL AND vin = \$2\)[^\n]*\n\s*ORDER BY \(samsara_vehicle_id = \$1\) DESC NULLS LAST[^\n]*\n\s*LIMIT 1`,\s*\n\s*\[t\.id, vin, equipmentNumber\]\s*\n\s*\);\s*\n\s*const row = /.test(block)) {
    failures.push("mdata.equipment existing lookup no longer matches by samsara_vehicle_id OR vin");
  }
  if (!/else if \(row\.oc !== operatingCompanyId\) bump\(counts, "other_company"\);/.test(block)) {
    failures.push("mdata.equipment VIN match no longer skips a row owned by another company (cross-entity link)");
  }
  if (!/UPDATE mdata\.equipment\s*\n\s*SET samsara_vehicle_id = COALESCE\(samsara_vehicle_id, \$2\),\s*\n\s*vin = COALESCE\(NULLIF\(vin, ''\), \$3\),[\s\S]{0,400}updated_at = now\(\)\s*\n\s*WHERE id = \$1::uuid/.test(block)) {
    failures.push("mdata.equipment UPDATE branch no longer writes samsara_vehicle_id (VIN-matched rows would stay unlinked)");
  }
  if (!/await client\.query\("SAVEPOINT trailer_row"\);/.test(block) || !/await client\.query\("ROLLBACK TO SAVEPOINT trailer_row"\)\.catch/.test(block)) {
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
    'await client.query("SAVEPOINT trailer_row");\n    try {',
    "{"
  ).replace(
    'await client.query("RELEASE SAVEPOINT trailer_row");\n    } catch (e) {\n      await client.query("ROLLBACK TO SAVEPOINT trailer_row").catch(() => {});\n      bump(counts, "failed");\n      errors.push(`trailer_link_failed:${t.id}:${String((e as Error)?.message ?? e)}`);\n    }',
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
