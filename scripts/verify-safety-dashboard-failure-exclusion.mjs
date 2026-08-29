#!/usr/bin/env node
import fs from "node:fs";

const contracts = [
  ["apps/frontend/src/pages/safety/PermitsPage.tsx", "permitsQuery.isError ? [] : permitsQuery.data?.renewal_alerts ?? []"],
  ["apps/frontend/src/pages/safety/PermitsPage.tsx", "permitsQuery.isError ? [] : permitsQuery.data?.permits ?? []"],
  ["apps/frontend/src/pages/safety/PermitsPage.tsx", "permitsQuery.isError ? undefined : permitsQuery.data?.renewal_reminder"],
  ["apps/frontend/src/pages/safety/PermitsPage.tsx", "disabled={permitsQuery.isError || reminderMutation.isPending}"],
  ["apps/frontend/src/pages/safety/PermitsPage.tsx", "!permitsQuery.isError && (renewalAlerts.length === 0"],
  ["apps/frontend/src/pages/safety/PositionHistoryPage.tsx", "historyQuery.isError ? [] : historyQuery.data?.rows ?? []"],
  ["apps/frontend/src/pages/safety/PositionHistoryPage.tsx", "historyQuery.isError ? 0 : historyQuery.data?.total ?? 0"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "fleetQuery.isError ? [] : fleetQuery.data?.rows ?? []"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "fleetQuery.isError ? 0 : fleetQuery.data?.total"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "violationsQuery.isError ? [] : violationsQuery.data?.hos_violations ?? []"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "const fleetIncomplete = failedDriverCount > 0"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "fleetQuery.isError || fleetIncomplete ? \"—\" : metrics.onDuty"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "fleetQuery.isError || fleetIncomplete ? \"—\" : metrics.offDuty"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "fleetQuery.isError || fleetIncomplete ? \"—\" : metrics.approachingCap"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "!fleetQuery.isError && !fleetIncomplete && metrics.nearViolations.length > 0"],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", "!fleetQuery.isError && fleetIncomplete ? ("],
];
const missingContract = (source, contract) => !source.includes(contract);
const check = () => contracts.filter(([file, contract]) => missingContract(fs.readFileSync(file, "utf8"), contract));
if (process.argv.includes("--selftest")) {
  for (const [file, contract] of contracts) {
    const source = fs.readFileSync(file, "utf8");
    const mutated = source.replace(contract, "");
    if (mutated === source || !missingContract(mutated, contract)) process.exit(1);
  }
  console.log(`verify-safety-dashboard-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}
const missing = check();
if (missing.length) {
  console.error(`verify-safety-dashboard-failure-exclusion FAIL\n- ${missing.map(([f,c]) => `${f}: ${c}`).join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-safety-dashboard-failure-exclusion PASS — ${contracts.length} permit/position/HOS dashboard contracts fail closed`);
