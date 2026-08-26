#!/usr/bin/env node
import fs from "node:fs";

const CONTRACTS = [
  ["apps/frontend/src/components/maintenance/DriverWorkOrdersReverseSection.tsx", "q.isError ? [] : (q.data?.work_orders ?? [])"],
  ["apps/frontend/src/components/maintenance/DriverReportsReverseSection.tsx", "query.isError ? [] : (query.data?.rows ?? [])"],
  ["apps/frontend/src/components/maintenance/UnitMaintenanceInspectionsReverseSection.tsx", "query.isError ? [] : (query.data?.rows ?? [])"],
  ["apps/frontend/src/components/maintenance/UnitPmSchedulesReverseSection.tsx", "query.isError ? [] : (query.data?.rows ?? [])"],
  ["apps/frontend/src/components/maintenance/UnitSevereRepairsReverseSection.tsx", "query.isError ? [] : (query.data?.data ?? [])"],
  ["apps/frontend/src/components/maintenance/WarrantyClaimsReverseSection.tsx", "query.isError ? [] : (query.data?.rows ?? [])"],
];

function check(file, source, contract) {
  if (!source.includes(contract)) return `${file}: failed reverse read must suppress cached rows`;
  return null;
}

if (process.argv.includes("--selftest")) {
  for (const [file, contract] of CONTRACTS) {
    const source = fs.readFileSync(file, "utf8");
    const mutated = source.replace(contract, contract.replace(/^[^?]+\? \[\] : \(/, "(").replace(/\)$/, ""));
    if (mutated === source || check(file, mutated, contract) == null) {
      console.error(`verify-maintenance-reverse-failure-exclusion SELFTEST FAIL — ${file} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-reverse-failure-exclusion SELFTEST PASS — ${CONTRACTS.length}/${CONTRACTS.length} exact stale-row mutations red`);
  process.exit(0);
}

const failures = CONTRACTS.map(([file, contract]) => check(file, fs.readFileSync(file, "utf8"), contract)).filter(Boolean);
if (failures.length) {
  console.error(`verify-maintenance-reverse-failure-exclusion FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-maintenance-reverse-failure-exclusion PASS — ${CONTRACTS.length} maintenance reverse surfaces fail closed`);
