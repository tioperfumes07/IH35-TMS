#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/maintenance/drivers.routes.ts";
const source = fs.readFileSync(file, "utf8");
const events = [
  "maintenance.drivers.updated",
  "maintenance.drivers.voided",
  "maintenance.drivers.imported",
];
const company = "operating_company_id: companyId";

function inspect(value) {
  return events.flatMap((event) => {
    const start = value.indexOf(`"${event}"`);
    if (start < 0) return [`missing ${event} audit`];
    return value.slice(start, start + 480).includes(company)
      ? []
      : [`${event} audit omits route company`];
  });
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-maint-drivers-company-audits FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const event of events) {
    const start = source.indexOf(`"${event}"`);
    const companyIndex = source.indexOf(company, start);
    if (companyIndex < 0 || companyIndex >= start + 480) throw new Error(`fixture missing ${event} company stamp`);
    const mutant = `${source.slice(0, companyIndex)}PLANTED_SCOPE: companyId${source.slice(companyIndex + company.length)}`;
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${event}`);
  }
  console.log(`verify-maint-drivers-company-audits --selftest PASS (${events.length}/${events.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-drivers-company-audits PASS — update, void, and import audits retain route company attribution");
