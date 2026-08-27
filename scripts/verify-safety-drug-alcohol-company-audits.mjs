#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/safety/drug-alcohol/routes.ts";
const source = fs.readFileSync(file, "utf8");
const events = [
  "safety.drug_alcohol.enrolled",
  "safety.drug_alcohol.bulk_enrolled",
  "safety.drug_alcohol.test_scheduled",
  "safety.drug_alcohol.result_recorded",
  "safety.drug_alcohol.positive_flagged",
  "safety.drug_alcohol.random_draw",
];
const company = "operating_company_id: parsed.data.operating_company_id";

function inspect(value) {
  return events.flatMap((event) => {
    const start = value.indexOf(`"${event}"`);
    if (start < 0) return [`missing ${event} audit`];
    return value.slice(start, start + 560).includes(company)
      ? []
      : [`${event} audit omits submitted company`];
  });
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-safety-drug-alcohol-company-audits FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const event of events) {
    const start = source.indexOf(`"${event}"`);
    const companyIndex = source.indexOf(company, start);
    if (companyIndex < 0 || companyIndex >= start + 560) throw new Error(`fixture missing ${event} company stamp`);
    const mutant = `${source.slice(0, companyIndex)}PLANTED_SCOPE: parsed.data.operating_company_id${source.slice(companyIndex + company.length)}`;
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${event}`);
  }
  console.log(`verify-safety-drug-alcohol-company-audits --selftest PASS (${events.length}/${events.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-safety-drug-alcohol-company-audits PASS — all six lifecycle audits retain submitted company attribution");
