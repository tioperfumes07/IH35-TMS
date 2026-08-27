#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/maintenance/two-section-service.ts";
const source = fs.readFileSync(file, "utf8");
const events = [
  "maintenance.wo.section_a_line_added",
  "maintenance.wo.section_b_line_added",
  "maintenance.wo.parts_subrow_added",
  "maintenance.wo.part_location_set",
  "maintenance.wo.created",
  "maintenance.work_order.opened",
];
const company = "operating_company_id: header.operating_company_id";

function auditEnd(value, start) {
  const match = /\n\s*\);/.exec(value.slice(start));
  return match ? start + match.index : -1;
}
function inspect(value) {
  return events.flatMap((event) => {
    const start = value.indexOf(`"${event}"`);
    if (start < 0) return [`missing ${event}`];
    const end = auditEnd(value, start);
    if (end < 0) return [`unterminated ${event}`];
    return value.slice(start, end).includes(company) ? [] : [`${event} omits header company`];
  });
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-two-section-wo-create-company-audits FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const event of events) {
    const start = source.indexOf(`"${event}"`);
    const end = auditEnd(source, start);
    const companyIndex = source.indexOf(company, start);
    if (companyIndex < 0 || companyIndex >= end) throw new Error(`fixture missing ${event}`);
    const mutant = `${source.slice(0, companyIndex)}PLANTED_SCOPE${source.slice(companyIndex + company.length)}`;
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${event}`);
  }
  console.log(`verify-two-section-wo-create-company-audits --selftest PASS (${events.length}/${events.length} planted defects red)`);
  process.exit(0);
}
console.log("verify-two-section-wo-create-company-audits PASS — canonical WO create audits retain company");
