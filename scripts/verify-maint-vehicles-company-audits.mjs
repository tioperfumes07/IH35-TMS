#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/maintenance/vehicles.routes.ts";
const source = fs.readFileSync(file, "utf8");
const events = [
  "maintenance.vehicles.created",
  "maintenance.vehicles.updated",
  "maintenance.vehicles.voided",
  "maintenance.vehicles.imported",
];

function inspect(value) {
  return events.flatMap((event) => {
    const start = value.indexOf(`\"${event}\"`);
    if (start < 0) return [`missing ${event} audit`];
    const payload = value.slice(start, start + 520);
    return payload.includes("operating_company_id: companyId")
      ? []
      : [`${event} audit omits operating_company_id`];
  });
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-maint-vehicles-company-audits FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const event of events) {
    const start = source.indexOf(`\"${event}\"`);
    const company = source.indexOf("operating_company_id: companyId", start);
    const mutant = `${source.slice(0, company)}PLANTED_SCOPE: companyId${source.slice(company + "operating_company_id: companyId".length)}`;
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${event}`);
  }
  console.log(`verify-maint-vehicles-company-audits --selftest PASS (${events.length}/${events.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-vehicles-company-audits PASS — create/update/void/import audits retain canonical company attribution");
