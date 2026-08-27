#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/safety/dot-inspection-events.routes.ts";
const source = fs.readFileSync(file, "utf8");
const event = '"safety.dot_inspection_event.follow_up_recorded"';
const company = "operating_company_id: body.data.operating_company_id";

function inspect(value) {
  const failures = [];
  const start = value.indexOf(event);
  if (start < 0) failures.push("missing follow-up audit event");
  else if (!value.slice(start, start + 420).includes(company)) failures.push("follow-up audit omits submitted company");
  if (!value.includes("WHERE id = $1::uuid\n            AND operating_company_id = $2::uuid")) failures.push("follow-up parent read is not company-scoped");
  if (!value.includes("INSERT INTO compliance.dot_inspection_event_followups (\n            operating_company_id,")) failures.push("follow-up row omits company");
  return failures;
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-safety-dot-followup-company-audit FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [company, "PLANTED_SCOPE: body.data.operating_company_id"],
    ["AND operating_company_id = $2::uuid", "AND true"],
    ["INSERT INTO compliance.dot_inspection_event_followups (\n            operating_company_id,", "INSERT INTO compliance.dot_inspection_event_followups (\n            unrelated_company,"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`fixture missing ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed ${before}`);
  }
  console.log(`verify-safety-dot-followup-company-audit --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-safety-dot-followup-company-audit PASS — follow-up parent, row, and audit share canonical company scope");
