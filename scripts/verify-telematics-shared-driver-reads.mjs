#!/usr/bin/env node
import fs from "node:fs";

const files = {
  clocks: "apps/backend/src/telematics/hos.routes.ts",
  roster: "apps/backend/src/telematics/hos-tracker.service.ts",
  summary: "apps/backend/src/telematics/driver-day-summary.routes.ts",
};
const real = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(source) {
  const checks = [
    ["dispatch clocks", source.clocks, "dispatch_clock_dca"],
    ["HOS roster", source.roster, "hos_roster_dca"],
    ["driver day summary", source.summary, "day_summary_dca"],
  ];
  const errors = [];
  for (const [label, text, alias] of checks) {
    for (const needle of [
      `FROM mdata.driver_company_authorizations ${alias}`,
      `${alias}.driver_id = d.id`,
      `${alias}.company_id = $1::uuid`,
      `${alias}.is_authorized = true`,
      `${alias}.deactivated_at IS NULL`,
    ]) if (!text.includes(needle)) errors.push(`${label}: missing ${needle}`);
  }
  if (!source.clocks.includes("d.id = ANY($2::uuid[])")) errors.push("dispatch clocks: requested driver ids are not retained");
  if (!source.roster.includes("a.operating_company_id = $1::uuid")) errors.push("HOS roster: assignment company scope missing");
  for (const needle of ["WHERE v.operating_company_id = $1::uuid", "WHERE e.operating_company_id = $1::uuid", "WHERE ft.operating_company_id = $1::uuid", "WHERE sa.operating_company_id = $1::uuid"])
    if (!source.summary.includes(needle)) errors.push(`driver day summary: missing ${needle}`);
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = Object.entries(real).flatMap(([key, text]) => {
    const alias = { clocks: "dispatch_clock_dca", roster: "hos_roster_dca", summary: "day_summary_dca" }[key];
    return [
      { ...real, [key]: text.replace(`${alias}.is_authorized = true`, `${alias}.is_authorized = false`) },
      { ...real, [key]: text.replace(`${alias}.deactivated_at IS NULL`, `${alias}.deactivated_at IS NOT NULL`) },
    ];
  });
  if (failures(real).length) throw new Error(`clean source failed: ${failures(real).join("; ")}`);
  const escaped = mutations.filter((mutation) => failures(mutation).length === 0);
  if (escaped.length) throw new Error(`${escaped.length}/${mutations.length} planted shared-driver defects escaped`);
  console.log(`PASS verify-telematics-shared-driver-reads --selftest (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const errors = failures(real);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("PASS verify-telematics-shared-driver-reads");
