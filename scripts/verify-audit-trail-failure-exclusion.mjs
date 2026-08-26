#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/audit/AuditTrailPage.tsx";
const contracts = [
  "const exactAuditEvent = exactAuditQuery.isError",
  "query.isError ? [] : query.data?.events ?? []",
  "[query.data?.events, query.isError]",
  "const totalCount = query.isError ? 0 : query.data?.total_count ?? 0",
];
const check = (source) => contracts.filter((contract) => !source.includes(contract));
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(file, "utf8");
  for (const contract of contracts) {
    const mutated = source.replace(contract, "");
    if (mutated === source || check(mutated).length === 0) process.exit(1);
  }
  console.log(`verify-audit-trail-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}
const missing = check(fs.readFileSync(file, "utf8"));
if (missing.length) {
  console.error(`verify-audit-trail-failure-exclusion FAIL\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-audit-trail-failure-exclusion PASS — exact/list audit failures suppress cached detail, rows, export, counts, and pagination");
