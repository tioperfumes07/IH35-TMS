#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/backend/src/safety/damage-continuity/insurance-link.service.ts";
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["AND operating_company_id = $2::uuid", 3],
  ["WHERE tenant_id = $2::uuid", 1],
  ["AND tenant_id = $2::uuid", 1],
  ["AND operating_company_id = $3::uuid", 1],
  ["AND operating_company_id = $4::uuid", 1],
  ["AND ic.operating_company_id = $4::uuid", 1],
  ["operating_company_id: params.operatingCompanyId", 1],
  ["params.operatingCompanyId,\n    ]", 1],
];
function occurrences(value, needle) { return value.split(needle).length - 1; }
function inspect(value) {
  const failures = [];
  if (value.includes("current_setting('app.operating_company_id'")) failures.push("service still relies on session company GUC");
  for (const [needle, count] of checks) if (occurrences(value, needle) < count) failures.push(`${needle} count below ${count}`);
  return failures;
}
const failures = inspect(source);
if (failures.length) { console.error(`verify-damage-auto-claim-explicit-company-scope FAIL:\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  let n = 0;
  for (const [needle] of checks) {
    const mutant = source.replace(needle, `PLANTED_SCOPE_${n}`);
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${needle}`);
    n += 1;
  }
  const gucMutant = source.replace("// GAP-38", "current_setting('app.operating_company_id' // GAP-38");
  if (inspect(gucMutant).length === 0) throw new Error("selftest missed GUC reliance");
  console.log(`verify-damage-auto-claim-explicit-company-scope --selftest PASS (${n + 1}/${n + 1} planted defects red)`);
  process.exit(0);
}
console.log("verify-damage-auto-claim-explicit-company-scope PASS — damage, policy, claim, incident, and chain linkage are company-bound");
