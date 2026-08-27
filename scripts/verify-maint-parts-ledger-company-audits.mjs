#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/maintenance/parts-inventory.routes.ts";
const source = fs.readFileSync(file, "utf8");
const events = ["maintenance.parts_purchase.voided", "maintenance.parts_inventory.adjusted"];
const company = "operating_company_id: query.data.operating_company_id";

function inspect(value) {
  return events.flatMap((event) => {
    const start = value.indexOf(`"${event}"`);
    if (start < 0) return [`missing ${event} audit`];
    return value.slice(start, start + 520).includes(company) ? [] : [`${event} audit omits query company`];
  });
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-maint-parts-ledger-company-audits FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const event of events) {
    const start = source.indexOf(`"${event}"`);
    const companyIndex = source.indexOf(company, start);
    if (companyIndex < 0 || companyIndex >= start + 520) throw new Error(`fixture missing ${event} company stamp`);
    const mutant = `${source.slice(0, companyIndex)}PLANTED_SCOPE${source.slice(companyIndex + company.length)}`;
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${event}`);
  }
  console.log(`verify-maint-parts-ledger-company-audits --selftest PASS (${events.length}/${events.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-parts-ledger-company-audits PASS — purchase void and stock adjustment audits retain query company");
