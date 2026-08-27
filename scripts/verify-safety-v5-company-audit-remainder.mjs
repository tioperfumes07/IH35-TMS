#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/backend/src/safety/safety-v5.routes.ts";
const source = fs.readFileSync(file, "utf8");
const events = ["safety.internal_fine.disputed", "safety.internal_fine.voided", "safety.complaint.created"];
const company = "operating_company_id: query.data.operating_company_id";
function inspect(value) {
  return events.flatMap((event) => {
    const start = value.indexOf(`"${event}"`);
    if (start < 0) return [`missing ${event} audit`];
    const end = value.indexOf("\n      );", start);
    if (end < 0) return [`unterminated ${event} audit`];
    return value.slice(start, end).includes(company) ? [] : [`${event} audit omits query company`];
  });
}
const failures = inspect(source);
if (failures.length) { console.error(`verify-safety-v5-company-audit-remainder FAIL:\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  for (const event of events) {
    const start = source.indexOf(`"${event}"`), end = source.indexOf("\n      );", start), companyIndex = source.indexOf(company, start);
    if (companyIndex < 0 || companyIndex >= end) throw new Error(`fixture missing ${event} company stamp`);
    const mutant = `${source.slice(0, companyIndex)}PLANTED_SCOPE${source.slice(companyIndex + company.length)}`;
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${event}`);
  }
  console.log(`verify-safety-v5-company-audit-remainder --selftest PASS (${events.length}/${events.length} planted defects red)`); process.exit(0);
}
console.log("verify-safety-v5-company-audit-remainder PASS — fine dispute/void and v5 complaint create audits retain company");
