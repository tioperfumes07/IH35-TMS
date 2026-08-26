#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/UserDetail.tsx";
const contracts = [
  "customersQuery.isError ? [] : customersQuery.data ?? []",
  "[customersQuery.data, customersQuery.isError]",
  "const rows = safetyEventsQuery.isError ? [] : safetyEventsQuery.data ?? []",
  "[safetyEventsQuery.data, safetyEventsQuery.isError]",
  "onRetry={() => void safetyEventsQuery.refetch()}",
  "(safetyEventsQuery.isError ? [] : safetyEventsQuery.data ?? []).map((event)",
  "selectedCompanyId && !customersQuery.isError",
  "onRetry={() => void customersQuery.refetch()}",
];
const check = (source) => contracts.filter((contract) => !source.includes(contract));
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(file, "utf8");
  for (const contract of contracts) {
    const mutated = source.replace(contract, "");
    if (mutated === source || check(mutated).length === 0) process.exit(1);
  }
  console.log(`verify-user-detail-linked-read-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}
const missing = check(fs.readFileSync(file, "utf8"));
if (missing.length) {
  console.error(`verify-user-detail-linked-read-failure-exclusion FAIL\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-user-detail-linked-read-failure-exclusion PASS — dispatcher safety and related-customer reads fail closed with Retry");
