#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/backend/src/driver-manager/role-views/dm-home.service.ts";
const real = fs.readFileSync(file, "utf8");
const aliases = ["manager_comms_dca", "manager_arrival_dca", "manager_score_dca", "manager_cooling_dca"];
function failures(source) {
  const errors = [];
  for (const alias of aliases) for (const needle of [`FROM mdata.driver_company_authorizations ${alias}`, `${alias}.company_id = $1::uuid`, `${alias}.is_authorized = true`, `${alias}.deactivated_at IS NULL`]) if (!source.includes(needle)) errors.push(`${alias}: missing ${needle}`);
  for (const needle of ["e.operating_company_id = $1::uuid", "l.operating_company_id = $1::uuid", "m.operating_company_id = $1::uuid"]) if (!source.includes(needle)) errors.push(`selected-company activity missing ${needle}`);
  return errors;
}
if (process.argv.includes("--selftest")) {
  if (failures(real).length) throw new Error(`clean failed: ${failures(real).join("; ")}`);
  const mutations = aliases.flatMap((alias) => [real.replace(`${alias}.is_authorized = true`, `${alias}.is_authorized = false`), real.replace(`${alias}.deactivated_at IS NULL`, `${alias}.deactivated_at IS NOT NULL`)]);
  const escaped = mutations.filter((source) => failures(source).length === 0); if (escaped.length) throw new Error(`${escaped.length}/${mutations.length} mutations escaped`);
  console.log(`PASS verify-driver-manager-shared-drivers --selftest (${mutations.length}/${mutations.length})`); process.exit(0);
}
const errors = failures(real); if (errors.length) { console.error(errors.join("\n")); process.exit(1); } console.log("PASS verify-driver-manager-shared-drivers");
