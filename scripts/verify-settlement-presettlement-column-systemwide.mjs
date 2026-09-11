#!/usr/bin/env node
import fs from "node:fs";

const surfaces = [
  "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx",
  "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
  "apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx",
  "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
  "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
  "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
  "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
  "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx",
  "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
  "apps/frontend/src/pages/reports/DispatchMarginPage.tsx",
  "apps/frontend/src/pages/reports/InvoiceSearchReportPage.tsx",
];

const required = [
  ["apps/backend/src/driver-finance/settlements.routes.ts", "/api/v1/driver-finance/settlement-references", "settlement_lines sl", "l.presettlement_link_id"],
  ["apps/frontend/src/api/driverFinance.ts", "SettlementReference", "getSettlementReferences"],
  ["apps/frontend/src/components/settlements/SettlementReferenceCell.tsx", "settlement-reference-cell", "Presettlement"],
  ["apps/backend/src/dispatch/book-load.service.ts", "AUTO-TOUR-ALL-LOADS", "randomUUID"],
  ["db/migrations/202614070000_repair_load_tour_assignment.sql", "assigned_primary_driver_id IS NOT NULL", "driver_finance.driver_settlements", "tour_id = resolved_tour_id"],
];

function check(read = (p) => fs.readFileSync(p, "utf8")) {
  const failures = [];
  for (const [file, ...tokens] of required) {
    if (!fs.existsSync(file)) { failures.push(`${file}: missing file`); continue; }
    const source = read(file);
    for (const token of tokens) if (!source.includes(token)) failures.push(`${file}: missing ${token}`);
  }
  for (const file of surfaces) {
    const source = read(file);
    if (!source.includes("settlement-reference-column")) failures.push(`${file}: missing systemic Settlement / Presettlement column`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const target = surfaces[0];
  const failures = check((file) => {
    const source = fs.readFileSync(file, "utf8");
    return file === target ? source.replace("settlement-reference-column", "planted-column-removal") : source;
  });
  if (!failures.some((line) => line.startsWith(target))) {
    console.error("SELFTEST FAIL: planted surface-column removal was not detected");
    process.exit(1);
  }
  console.log(`SELFTEST PASS: planted removal detected (${failures[0]})`);
  process.exit(0);
}

const failures = check();
if (failures.length) {
  console.error(`verify-settlement-presettlement-column-systemwide FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`verify-settlement-presettlement-column-systemwide PASS (${surfaces.length}/${surfaces.length} surfaces)`);
