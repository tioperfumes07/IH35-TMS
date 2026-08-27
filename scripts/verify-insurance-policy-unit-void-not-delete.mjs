#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/insurance/policy.routes.ts";
const source = fs.readFileSync(file, "utf8");
function audit(value) {
  const failures = [];
  if (/DELETE FROM insurance\.policy_unit/.test(value)) failures.push("policy-unit lifecycle must never hard delete");
  const generic = value.match(/app\.delete\("\/api\/v1\/insurance\/policy-units\/:id"[\s\S]*?app\.get\(/)?.[0] ?? "";
  if (!/UPDATE insurance\.policy_unit[\s\S]{0,120}removed_at = COALESCE\(removed_at, now\(\)\)/.test(generic)) failures.push("generic delete route must archive idempotently");
  if (!/insurance\.policy_unit\.removed/.test(generic)) failures.push("archive must emit removed audit vocabulary");
  return failures;
}
const failures = audit(source);
if (failures.length) {
  console.error(`verify-insurance-policy-unit-void-not-delete FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("UPDATE insurance.policy_unit\n          SET removed_at = COALESCE(removed_at, now()), updated_at = now()", "DELETE FROM insurance.policy_unit"),
    source.replace("removed_at = COALESCE(removed_at, now())", "removed_at = NULL"),
    source.replaceAll('insurance.policy_unit.removed",', 'insurance.policy_unit.deleted",'),
  ];
  for (const planted of mutations) if (audit(planted).length === 0) throw new Error("planted policy-unit deletion escaped");
  console.log("verify-insurance-policy-unit-void-not-delete SELFTEST PASS — 3/3 planted defects detected");
  process.exit(0);
}
console.log("verify-insurance-policy-unit-void-not-delete PASS — every policy-unit removal preserves history");
