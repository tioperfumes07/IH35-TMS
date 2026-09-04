#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/backend/src/integrity/driver-metrics.service.ts";
const real = fs.readFileSync(file, "utf8");
function failures(source) {
  const required = ["FROM mdata.driver_company_authorizations metrics_roster_dca", "metrics_roster_dca.driver_id = d.id", "metrics_roster_dca.company_id = $1::uuid", "metrics_roster_dca.is_authorized = true", "metrics_roster_dca.deactivated_at IS NULL", "ft.operating_company_id = $1::uuid", "e.operating_company_id = $1::uuid", "w.operating_company_id = $1::uuid", "ar.operating_company_id = $1::uuid", "LEFT JOIN maintenance.parts_inventory p", "p.operating_company_id = w.operating_company_id", "p.part_description", "p.part_number"];
  const missing = required.filter((needle) => !source.includes(needle));
  if (source.includes("maint.part")) missing.push("retired maint.part reference");
  return missing;
}
if (process.argv.includes("--selftest")) {
  if (failures(real).length) throw new Error(`clean failed: ${failures(real).join("; ")}`);
  const mutations = [
    real.replace("metrics_roster_dca.is_authorized = true", "metrics_roster_dca.is_authorized = false"),
    real.replace("metrics_roster_dca.deactivated_at IS NULL", "metrics_roster_dca.deactivated_at IS NOT NULL"),
    real.replace("metrics_roster_dca.company_id = $1::uuid", "metrics_roster_dca.company_id = d.operating_company_id"),
    real.replace("LEFT JOIN maintenance.parts_inventory p", "LEFT JOIN maint.part p"),
    real.replace("p.operating_company_id = w.operating_company_id", "p.operating_company_id IS NOT NULL"),
    real.replaceAll("p.part_description", "p.name"),
    real.replaceAll("p.part_number", "p.sku"),
  ];
  const escaped = mutations.filter((source) => failures(source).length === 0); if (escaped.length) throw new Error(`${escaped.length}/${mutations.length} mutations escaped`);
  console.log(`PASS verify-driver-metrics-shared-roster --selftest (${mutations.length}/${mutations.length})`); process.exit(0);
}
const errors = failures(real); if (errors.length) { console.error(errors.join("\n")); process.exit(1); } console.log("PASS verify-driver-metrics-shared-roster");
