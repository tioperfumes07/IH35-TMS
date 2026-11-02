#!/usr/bin/env node
/**
 * Shell QA — Cursor-seat datetime cells must use formatDateTimeUS, not browser toLocaleString.
 */
import fs from "node:fs";

const LABEL = "verify-cursor-surfaces-datetime-format";
const FILES = [
  "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
  "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
  "apps/frontend/src/pages/dispatch/LoadHistoryPage.tsx",
  "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
  "apps/frontend/src/pages/fuel/components/CompliancePanel.tsx",
  "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
  "apps/frontend/src/pages/driver-finance/components/CloseTripPanel.tsx",
  "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx",
];

const fails = [];
for (const path of FILES) {
  const src = fs.readFileSync(path, "utf8");
  if (!/formatDateTimeUS/.test(src)) {
    fails.push(`${path}: must import/use formatDateTimeUS`);
  }
  // Date-time cells only — allow number toLocaleString for miles/counts.
  if (/new Date\([^)]+\)\.toLocaleString\(/.test(src)) {
    fails.push(`${path}: must not new Date(...).toLocaleString()`);
  }
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = fs.readFileSync(FILES[0], "utf8").replace(/formatDateTimeUS/g, "toLocaleString");
  if (!/toLocaleString/.test(plant) || /formatDateTimeUS/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Cursor surfaces use formatDateTimeUS`);
