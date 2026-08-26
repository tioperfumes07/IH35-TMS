#!/usr/bin/env node
import fs from "node:fs";

const CONTRACTS = [
  ["apps/frontend/src/components/compliance/UnitTaxFilingsReverseSection.tsx", "propertyTaxQ.isError ? [] : propertyTaxQ.data?.renditions ?? []"],
  ["apps/frontend/src/components/compliance/UnitTaxFilingsReverseSection.tsx", "form2290Q.isError ? [] : form2290Q.data?.filings ?? []"],
  ["apps/frontend/src/components/reports/BackhaulSuggestionsWidget.tsx", "query.isError ? \"current location\" : query.data?.current_location ?? \"current location\""],
  ["apps/frontend/src/components/reports/BackhaulSuggestionsWidget.tsx", "query.isError ? [] : query.data?.suggestions ?? []"],
  ["apps/frontend/src/components/safety/ComplaintsReverseSection.tsx", "query.isError ? [] : query.data?.complaints ?? []"],
  ["apps/frontend/src/components/safety/DispatcherSafetyEventsReverseBlock.tsx", "query.isError ? [] : query.data?.events ?? []"],
  ["apps/frontend/src/components/safety/DriverTempCoverReverseSection.tsx", "query.isError ? [] : query.data?.assignments ?? []"],
  ["apps/frontend/src/components/safety/SafetyEventsReverseBlock.tsx", "query.isError ? [] : query.data?.events ?? []"],
  ["apps/frontend/src/components/safety/UnitPermitsReverseSection.tsx", "query.isError ? [] : query.data?.permits ?? []"],
  ["apps/frontend/src/components/safety/UnitTempCoverReverseSection.tsx", "query.isError ? [] : query.data?.assignments ?? []"],
  ["apps/frontend/src/components/tasks/TasksTab.tsx", "tasksQuery.isError ? [] : tasksQuery.data?.tasks ?? []"],
  ["apps/frontend/src/components/users/UserActivityTab.tsx", "auditQuery.isError ? [] : auditQuery.data?.events ?? []"],
  ["apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "auditQuery.isError ? [] : auditQuery.data?.events ?? []"],
];

const check = (file, source, contract) =>
  source.includes(contract) ? null : `${file}: failed reverse read must suppress cached labels, counts, and rows`;

if (process.argv.includes("--selftest")) {
  for (const [file, contract] of CONTRACTS) {
    const source = fs.readFileSync(file, "utf8");
    const mutated = source.replace(contract, contract.slice(contract.indexOf(":") + 1).trim());
    if (mutated === source || check(file, mutated, contract) == null) {
      console.error(`verify-cross-module-reverse-failure-exclusion SELFTEST FAIL — ${file} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log(`verify-cross-module-reverse-failure-exclusion SELFTEST PASS — ${CONTRACTS.length}/${CONTRACTS.length} exact mutations red`);
  process.exit(0);
}

const failures = CONTRACTS
  .map(([file, contract]) => check(file, fs.readFileSync(file, "utf8"), contract))
  .filter(Boolean);
if (failures.length) {
  console.error(`verify-cross-module-reverse-failure-exclusion FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-cross-module-reverse-failure-exclusion PASS — ${CONTRACTS.length} reverse contracts across compliance/reports/safety/tasks/users/audit fail closed`);
