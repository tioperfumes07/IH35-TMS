#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/insurance/payment-schedule.routes.ts";
const source = fs.readFileSync(file, "utf8");

function audit(value) {
  const failures = [];
  const creator = value.match(/app\.post\("\/api\/v1\/insurance\/payment-schedule"[\s\S]*?app\.patch\(/)?.[0] ?? "";
  if (!/FROM insurance\.policy[\s\S]{0,160}id = \$1::uuid AND tenant_id = \$2::uuid/.test(creator)) failures.push("creator must validate policy ownership");
  if (!/if \(!policy\.rows\[0\]\) return null;[\s\S]{0,220}INSERT INTO insurance\.payment_schedule/.test(creator)) failures.push("invalid policy must stop before insert");
  if (!/if \(!created\) return reply\.code\(404\)\.send\(\{ error: "policy_not_found" \}\)/.test(creator)) failures.push("invalid policy must fail loud");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-insurance-payment-schedule-policy-company-link FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("tenant_id = $2::uuid", "TRUE"),
    source.replace("if (!policy.rows[0]) return null;", "void policy;"),
    source.replace('error: "policy_not_found"', 'error: "unknown"'),
  ];
  for (const planted of mutations) if (audit(planted).length === 0) throw new Error("planted policy-link defect escaped");
  console.log("verify-insurance-payment-schedule-policy-company-link SELFTEST PASS — 3/3 planted defects detected");
  process.exit(0);
}
console.log("verify-insurance-payment-schedule-policy-company-link PASS — schedule creator binds policy to company before insert");
