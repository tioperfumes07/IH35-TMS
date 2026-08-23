#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/backend/src/mdata/loads.routes.ts";
const real = fs.readFileSync(file, "utf8");
const aliases = ["load_list_dca", "load_detail_primary_dca", "load_detail_secondary_dca", "load_access_dca"];
function failures(source) {
  const errors = [];
  for (const alias of aliases) for (const needle of [`FROM mdata.driver_company_authorizations ${alias}`, `${alias}.company_id = l.operating_company_id`, `${alias}.is_authorized = true`, `${alias}.deactivated_at IS NULL`]) if (!source.includes(needle)) errors.push(`${alias}: missing ${needle}`);
  for (const [alias, driver] of [["load_list_dca","d"],["load_detail_primary_dca","pd"],["load_detail_secondary_dca","sd"],["load_access_dca","d"]]) if (!source.includes(`${alias}.driver_id = ${driver}.id`)) errors.push(`${alias}: canonical FK missing`);
  if (!source.includes("d.id = l.assigned_primary_driver_id OR d.id = l.assigned_secondary_driver_id")) errors.push("assigned-driver primary/secondary symmetry missing");
  return errors;
}
if (process.argv.includes("--selftest")) {
  if (failures(real).length) throw new Error(`clean source failed: ${failures(real).join("; ")}`);
  const mutations = aliases.flatMap((alias) => [real.replace(`${alias}.is_authorized = true`, `${alias}.is_authorized = false`), real.replace(`${alias}.deactivated_at IS NULL`, `${alias}.deactivated_at IS NOT NULL`)]);
  const escaped = mutations.filter((source) => failures(source).length === 0);
  if (escaped.length) throw new Error(`${escaped.length}/${mutations.length} planted defects escaped`);
  console.log(`PASS verify-load-reads-shared-drivers --selftest (${mutations.length}/${mutations.length})`); process.exit(0);
}
const errors = failures(real); if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("PASS verify-load-reads-shared-drivers");
