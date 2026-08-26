#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/maintenance/LaborTracker.tsx";
const contracts = [
  "laborCodesQuery.isError ? [] : laborCodesQuery.data?.labor_codes ?? []",
  "entriesQuery.isError ? [] : entriesQuery.data?.time_entries ?? []",
  "disabled={laborCodesQuery.isError}",
  "message=\"Could not load labor codes.\"",
  "onRetry={() => void laborCodesQuery.refetch()}",
];

const check = (source) => contracts.filter((contract) => !source.includes(contract));
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(file, "utf8");
  for (const contract of contracts) {
    const mutated = source.replace(contract, "");
    if (mutated === source || check(mutated).length === 0) {
      console.error(`verify-maint-labor-query-failure-exclusion SELFTEST FAIL — mutation stayed green: ${contract}`);
      process.exit(1);
    }
  }
  console.log(`verify-maint-labor-query-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}

const missing = check(fs.readFileSync(file, "utf8"));
if (missing.length) {
  console.error(`verify-maint-labor-query-failure-exclusion FAIL\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-maint-labor-query-failure-exclusion PASS — labor codes and WO entries fail closed with Retry");
