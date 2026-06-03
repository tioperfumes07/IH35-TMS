#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(ROOT, "db/migrations/0310_predictive_auto_wo.sql"), "utf8");

for (const policy of ["fault_rules_company_isolation", "fault_history_company_isolation"]) {
  if (!sql.includes(policy)) {
    console.error(`verify:fault-auto-wo-rls FAIL: ${policy} policy missing`);
    process.exit(1);
  }
}
if (!sql.includes("identity.is_lucia_bypass()")) {
  console.error("verify:fault-auto-wo-rls FAIL: lucia bypass guard missing");
  process.exit(1);
}
if (!sql.includes("ENABLE ROW LEVEL SECURITY")) {
  console.error("verify:fault-auto-wo-rls FAIL: RLS not enabled on fault tables");
  process.exit(1);
}

console.log("verify:fault-auto-wo-rls PASS");
