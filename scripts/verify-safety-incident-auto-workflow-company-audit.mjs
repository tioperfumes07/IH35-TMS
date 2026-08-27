#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/safety/incidents/auto-workflow-trigger.ts";
const source = fs.readFileSync(file, "utf8");
const event = '"safety.incident.auto_workflow_triggered"';
const company = "operating_company_id: input.operating_company_id";

function inspect(value) {
  const start = value.indexOf(event);
  if (start < 0) return ["missing auto-workflow audit"];
  const end = value.indexOf("\n  );", start);
  if (end < 0) return ["unterminated auto-workflow audit"];
  return value.slice(start, end).includes(company)
    ? []
    : ["auto-workflow audit omits incident company"];
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-safety-incident-auto-workflow-company-audit FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const companyIndex = source.indexOf(company, source.indexOf(event));
  if (companyIndex < 0) throw new Error("fixture missing company stamp");
  const mutant = `${source.slice(0, companyIndex)}PLANTED_SCOPE${source.slice(companyIndex + company.length)}`;
  if (inspect(mutant).length === 0) throw new Error("selftest missed removed company stamp");
  console.log("verify-safety-incident-auto-workflow-company-audit --selftest PASS (1/1 planted defect red)");
  process.exit(0);
}

console.log("verify-safety-incident-auto-workflow-company-audit PASS — auto-workflow audit retains incident company");
