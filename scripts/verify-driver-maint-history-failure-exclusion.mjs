#!/usr/bin/env node
import fs from "node:fs";

const CONTRACTS = [
  ["apps/frontend/src/components/drivers/AuditHistoryTab.tsx", "auditQuery.isError ? [] : auditQuery.data?.events ?? []", 2],
  ["apps/frontend/src/components/drivers/LoadHistoryTab.tsx", "assignedQ.isError ? [] : assignedQ.data?.loads ?? []", 1],
  ["apps/frontend/src/components/drivers/LoadHistoryTab.tsx", "historyQ.isError ? [] : historyQ.data?.rows ?? []", 1],
  ["apps/frontend/src/components/drivers/OperationsHistoryTable.tsx", "query.isError ? [] : query.data?.rows ?? []", 1],
  ["apps/frontend/src/components/drivers/OperationsHistoryTable.tsx", "query.isError ? 0 : query.data?.total ?? 0", 1],
  ["apps/frontend/src/components/drivers/OperationsHistoryTable.tsx", "query.isError ? false : query.data?.has_more ?? false", 1],
  ["apps/frontend/src/components/maintenance/DvirMaintenanceInspectionsReverseSection.tsx", "query.isError ? [] : query.data?.rows ?? []", 1],
  ["apps/frontend/src/components/maintenance/LoadDriverReportsReverseSection.tsx", "query.isError ? [] : query.data?.rows ?? []", 1],
  ["apps/frontend/src/components/maintenance/LoadDriverReportsReverseSection.tsx", "query.isError ? 0 : query.data?.total_count ?? rows.length", 1],
  ["apps/frontend/src/components/maintenance/TrailerTiresReverseSection.tsx", "query.isError ? [] : query.data?.rows ?? []", 1],
  ["apps/frontend/src/components/maintenance/UnitTireProgramReverseSection.tsx", "query.isError ? [] : query.data?.positions ?? []", 1],
  ["apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx", "partsQuery.isError ? [] : partsQuery.data?.rows ?? []", 1],
  ["apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx", "partsQuery.isError ? 0 : partsQuery.data?.total_count ?? rows.length", 1],
];

const occurrences = (source, contract) => source.split(contract).length - 1;

if (process.argv.includes("--selftest")) {
  for (const [file, contract, count] of CONTRACTS) {
    const source = fs.readFileSync(file, "utf8");
    const mutated = source.replace(contract, contract.slice(contract.indexOf(":") + 1).trim());
    if (mutated === source || occurrences(mutated, contract) >= count) {
      console.error(`verify-driver-maint-history-failure-exclusion SELFTEST FAIL — ${file} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log(`verify-driver-maint-history-failure-exclusion SELFTEST PASS — ${CONTRACTS.length}/${CONTRACTS.length} exact mutations red`);
  process.exit(0);
}

const failures = [];
for (const [file, contract, count] of CONTRACTS) {
  const source = fs.readFileSync(file, "utf8");
  if (occurrences(source, contract) < count) failures.push(`${file}: expected ${count} failure-safe ${contract}`);
}
if (failures.length) {
  console.error(`verify-driver-maint-history-failure-exclusion FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-driver-maint-history-failure-exclusion PASS — ${CONTRACTS.length} driver/maintenance/inventory history contracts fail closed`);
