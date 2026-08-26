#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx";
const contracts = [
  "inboxQuery.isError ? [] : inboxQuery.data?.events ?? []",
  "inboxQuery.isError ? 0 : inboxQuery.data?.pending_count ?? 0",
  "rulesQuery.isError ? [] : rulesQuery.data?.document_alert_rules ?? []",
];
const check = (source) => contracts.filter((contract) => !source.includes(contract));
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(file, "utf8");
  for (const contract of contracts) {
    const mutated = source.replace(contract, "");
    if (mutated === source || check(mutated).length === 0) process.exit(1);
  }
  console.log(`verify-document-alerts-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}
const missing = check(fs.readFileSync(file, "utf8"));
if (missing.length) {
  console.error(`verify-document-alerts-failure-exclusion FAIL\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-document-alerts-failure-exclusion PASS — failed inbox/rules reads suppress cached rows and pending counts");
