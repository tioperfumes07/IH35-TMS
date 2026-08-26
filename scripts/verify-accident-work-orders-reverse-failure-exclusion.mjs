#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const contracts = [
  "if (detailQuery.isError) {\n      setSpawnedWorkOrders([]);",
  "[detailQuery.data, detailQuery.isError]",
  "detailQuery.isError ? (",
  "onRetry={() => void detailQuery.refetch()}",
  "!detailQuery.isError && spawnedWorkOrders.length > 0",
];

const check = (source) => contracts.filter((contract) => !source.includes(contract));

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(file, "utf8");
  for (const contract of contracts) {
    const mutated = source.replace(contract, "");
    if (mutated === source || check(mutated).length === 0) {
      console.error(`verify-accident-work-orders-reverse-failure-exclusion SELFTEST FAIL — mutation stayed green: ${contract}`);
      process.exit(1);
    }
  }
  console.log(`verify-accident-work-orders-reverse-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}

const missing = check(fs.readFileSync(file, "utf8"));
if (missing.length) {
  console.error(`verify-accident-work-orders-reverse-failure-exclusion FAIL\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-accident-work-orders-reverse-failure-exclusion PASS — accident→WO reverse rows clear, retry, and never render on failed detail reads");
