#!/usr/bin/env node
import fs from "node:fs";

const CONTRACTS = [
  ["apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx", "query.isError ? [] : query.data?.incidents ?? []"],
  ["apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx", "accidentsQuery.isError ? [] : accidentsQuery.data?.accidents ?? []"],
  ["apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx", "inspectionsQuery.isError ? [] : inspectionsQuery.data?.dot_inspections ?? []"],
  ["apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx", "dvirQuery.isError ? [] : dvirQuery.data?.submissions ?? []"],
  ["apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "civilFinesQuery.isError ? [] : civilFinesQuery.data?.fines ?? []"],
  ["apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "internalFinesQuery.isError ? [] : internalFinesQuery.data?.fines ?? []"],
  ["apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "complaintsQuery.isError ? [] : complaintsQuery.data?.complaints ?? []"],
  ["apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "testsQuery.isError ? [] : testsQuery.data?.tests ?? []"],
  ["apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "dotInspectionsQuery.isError ? [] : dotInspectionsQuery.data?.dot_inspections ?? []"],
  ["apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "accidentsQuery.isError ? [] : accidentsQuery.data?.accidents ?? []"],
  ["apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "trainingQuery.isError ? [] : trainingQuery.data?.training_completions ?? []"],
  ["apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx", "hosViolationsQuery.isError ? [] : hosViolationsQuery.data?.hos_violations ?? []"],
];

const check = (file, source, contract) => source.includes(contract) ? null : `${file}: failed composite reverse read must suppress cached rows and counts`;

if (process.argv.includes("--selftest")) {
  for (const [file, contract] of CONTRACTS) {
    const source = fs.readFileSync(file, "utf8");
    const mutated = source.replace(contract, contract.slice(contract.indexOf(":") + 1).trim());
    if (mutated === source || check(file, mutated, contract) == null) {
      console.error(`verify-safety-composite-reverse-failure-exclusion SELFTEST FAIL — ${file} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log(`verify-safety-composite-reverse-failure-exclusion SELFTEST PASS — ${CONTRACTS.length}/${CONTRACTS.length} exact mutations red`);
  process.exit(0);
}

const failures = CONTRACTS.map(([file, contract]) => check(file, fs.readFileSync(file, "utf8"), contract)).filter(Boolean);
if (failures.length) {
  console.error(`verify-safety-composite-reverse-failure-exclusion FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-safety-composite-reverse-failure-exclusion PASS — ${CONTRACTS.length} safety composite reverse contracts fail closed`);
