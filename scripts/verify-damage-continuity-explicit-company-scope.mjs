#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/backend/src/safety/damage-continuity/continuity.service.ts";
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["AND operating_company_id = $2::uuid", 6],
  ["AND operating_company_id = $3::uuid", 2],
  ["AND operating_company_id = $4::uuid", 1],
  ["AND operating_company_id = $5::uuid", 1],
  ["AND c.operating_company_id = $3::uuid", 1],
  ["AND i.operating_company_id = c.operating_company_id", 1],
  ["operating_company_id: params.operatingCompanyId", 3],
];
function occurrences(value, needle) { return value.split(needle).length - 1; }
function inspect(value) {
  const failures = [];
  if (value.includes("current_setting('app.operating_company_id'")) failures.push("service still relies on session company GUC");
  for (const [needle, count] of checks) if (occurrences(value, needle) < count) failures.push(`${needle} count below ${count}`);
  return failures;
}
const failures = inspect(source);
if (failures.length) { console.error(`verify-damage-continuity-explicit-company-scope FAIL:\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  let n = 0;
  for (const [needle] of checks) {
    const mutant = source.replace(needle, `PLANTED_SCOPE_${n}`);
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${needle}`);
    n += 1;
  }
  const gucMutant = source.replace("// All functions also carry explicit company predicates.", "current_setting('app.operating_company_id'");
  if (inspect(gucMutant).length === 0) throw new Error("selftest missed GUC reliance");
  console.log(`verify-damage-continuity-explicit-company-scope --selftest PASS (${n + 1}/${n + 1} planted defects red)`);
  process.exit(0);
}
console.log("verify-damage-continuity-explicit-company-scope PASS — start/append/close use explicit company boundaries");
