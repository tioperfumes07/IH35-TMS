#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationPath = "db/migrations/202613761300_samsara_usmca_retag.sql";

export function inspect(source) {
  const failures = [];
  const requirePattern = (pattern, message) => {
    if (!pattern.test(source)) failures.push(message);
  };

  requirePattern(/currently_leased_to_company_id\s*=\s*usmca_id/g, "all telemetry re-tags must be lease-scoped to USMCA");
  requirePattern(/UPDATE integrations\.samsara_vehicles[\s\S]*SET operating_company_id = usmca_id/i, "vehicle mirror is not re-tagged");
  requirePattern(/UPDATE telematics\.vehicle_locations[\s\S]*SET operating_company_id = usmca_id/i, "position history is not re-tagged");
  requirePattern(/ADD COLUMN IF NOT EXISTS source_operating_company_id/i, "position tenant provenance is not preserved");
  requirePattern(/ADD COLUMN IF NOT EXISTS source_raw_samsara_event_id/i, "position event provenance is not preserved");
  requirePattern(/'retag:' \|\| transportation_id::text/i, "colliding legacy event ids are not namespaced before re-tag");
  requirePattern(/UPDATE telematics\.vehicle_driver_assignments[\s\S]*SET operating_company_id = usmca_id/i, "assignment history is not re-tagged");
  requirePattern(/UPDATE integrations\.samsara_config[\s\S]*SET is_enabled = false/i, "Transportation ingestion is not disabled");
  requirePattern(/ON CONFLICT \(operating_company_id\) DO UPDATE/i, "USMCA config handoff is not idempotent");
  requirePattern(/DISABLE TRIGGER trg_block_vehicle_locations_update[\s\S]*ENABLE TRIGGER trg_block_vehicle_locations_update/i, "vehicle-location WORM trigger is not restored");
  requirePattern(/DISABLE TRIGGER trg_block_vehicle_driver_assignments_update[\s\S]*ENABLE TRIGGER trg_block_vehicle_driver_assignments_update/i, "assignment WORM trigger is not restored");
  requirePattern(/RAISE EXCEPTION 'Samsara USMCA re-tag incomplete/i, "migration does not fail closed on residual wrong-tenant rows");
  if (/\bDELETE\s+FROM\b/i.test(source)) failures.push("migration must never delete Samsara evidence");
  return failures;
}

function runSelftest(source) {
  const mutations = [
    source.replaceAll("UPDATE telematics.vehicle_locations", "UPDATE telematics.BROKEN_vehicle_locations"),
    source.replaceAll("UPDATE telematics.vehicle_driver_assignments", "UPDATE telematics.BROKEN_vehicle_driver_assignments"),
    source.replaceAll("SET is_enabled = false,", "SET is_enabled = true,"),
    `${source}\nDELETE FROM telematics.vehicle_locations;`,
  ];
  let caught = 0;
  for (const mutant of mutations) if (inspect(mutant).length > 0) caught += 1;
  if (caught !== mutations.length) {
    console.error(`verify-samsara-usmca-retag-migration selftest FAILED ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`verify-samsara-usmca-retag-migration selftest PASS ${caught}/${mutations.length}`);
}

const source = fs.readFileSync(path.join(root, migrationPath), "utf8");
if (process.argv.includes("--selftest")) runSelftest(source);
const failures = inspect(source);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-samsara-usmca-retag-migration PASS");
