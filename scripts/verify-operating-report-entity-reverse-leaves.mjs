#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leafRe":"^report\\.(settlement_summary|profit_per_truck|maintenance_cost_per_unit)$","task":"OPERATING-REPORT-ENTITY-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leafRe":"^(profiles\\.detail|settlements)$","task":"OPERATING-REPORT-ENTITY-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\\.profile\\.maintenance$","task":"OPERATING-REPORT-ENTITY-REVERSE-LEAVES","vertical":"column-wave"} */

import fs from "node:fs";

const sources = {
  settlements: fs.readFileSync("apps/frontend/src/pages/reports/SettlementSummaryPage.tsx", "utf8"),
  profit: fs.readFileSync("apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx", "utf8"),
  maintenance: fs.readFileSync("apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.tsx", "utf8"),
};

const checks = [
  ["settlements", /getSettlementSummary\(\{[\s\S]*operating_company_id: companyId/, "settlement read is company-scoped"],
  ["settlements", /kind="driver"[\s\S]*id=\{r\.driver_id\}/, "settlement driver is a canonical drill"],
  ["settlements", /navigate\(`\/drivers\/\$\{r\.driver_id\}\?tab=settlements`\)/, "settlement row reaches driver reverse tab"],
  ["settlements", /ReportBlockTPendingBanner[\s\S]*query\.refetch\(\)/, "settlement failure is retryable"],
  ["profit", /getProfitPerTruck\(\{[\s\S]*operating_company_id: companyId/, "profit-per-truck read is company-scoped"],
  ["profit", /kind="unit"[\s\S]*id=\{r\.unit_id\}/, "profit row drills to unit"],
  ["profit", /kind="driver"[\s\S]*id=\{r\.primary_driver_id\}/, "profit row drills to driver"],
  ["profit", /ReportBlockTPendingBanner[\s\S]*query\.refetch\(\)/, "profit failure is retryable"],
  ["maintenance", /getMaintenanceCostPerUnit\(\{[\s\S]*operating_company_id: companyId/, "maintenance report read is company-scoped"],
  ["maintenance", /kind="unit"[\s\S]*id=\{r\.unit_id\}/, "maintenance row drills to unit"],
  ["maintenance", /navigate\(`\/fleet\/units\/\$\{r\.unit_id\}\?tab=maintenance`\)/, "maintenance row reaches unit reverse tab"],
  ["maintenance", /ReportBlockVPendingBanner[\s\S]*query\.refetch\(\)/, "maintenance failure is retryable"],
];

const failures = (candidate) => checks
  .filter(([key, pattern]) => !pattern.test(candidate[key]))
  .map(([, , label]) => label);

const found = failures(sources);
if (found.length) {
  console.error(`verify-operating-report-entity-reverse-leaves: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = {
      ...sources,
      [key]: sources[key].replace(new RegExp(pattern.source, `${pattern.flags}g`), "/* planted defect */"),
    };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-operating-report-entity-reverse-leaves: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-operating-report-entity-reverse-leaves: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-operating-report-entity-reverse-leaves: PASS — ${checks.length} report/entity reverse invariants`);
