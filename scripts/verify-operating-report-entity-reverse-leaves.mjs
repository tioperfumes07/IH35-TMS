#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leaves":["report.profit_per_truck"],"task":"CLASS-F5904-OPERATING-REPORT-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leaves":["settlements"],"task":"CLASS-F5904-OPERATING-REPORT-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.maintenance"],"task":"CLASS-F5904-OPERATING-REPORT-REVERSE-EXACT","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  settlements: fs.readFileSync("apps/frontend/src/pages/reports/SettlementSummaryPage.tsx", "utf8"),
  profit: fs.readFileSync("apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx", "utf8"),
  maintenance: fs.readFileSync("apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.tsx", "utf8"),
  reportsMatrix: fs.readFileSync("docs/specs/scoreboard/modules/reports.required.json", "utf8"),
  driversMatrix: fs.readFileSync("docs/specs/scoreboard/modules/drivers.required.json", "utf8"),
  fleetMatrix: fs.readFileSync("docs/specs/scoreboard/modules/fleet.required.json", "utf8"),
  self: fs.readFileSync("scripts/verify-operating-report-entity-reverse-leaves.mjs", "utf8"),
};

function required(source, key, id) {
  return JSON.parse(source[key]).leaves.find((leaf) => leaf.id === id)?.required ?? [];
}

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

const failures = (candidate) => {
  const found = checks
    .filter(([key, pattern]) => !pattern.test(candidate[key]))
    .map(([, , label]) => label);
  const cells = [
    ["reportsMatrix", "report.profit_per_truck"],
    ["driversMatrix", "settlements"],
    ["fleetMatrix", "unit.profile.maintenance"],
  ];
  for (const [key, id] of cells) {
    if (!required(candidate, key, id).includes("reverse_link")) found.push(`${key} ${id} must require reverse_link`);
  }
  const headers = [
    '"modules":["reports"],"cols":["reverse_link"],"leaves":["report.profit_per_truck"]',
    '"modules":["drivers"],"cols":["reverse_link"],"leaves":["settlements"]',
    '"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.maintenance"]',
  ];
  const annotationBlock = candidate.self.split("\n").slice(0, 4).join("\n");
  for (const header of headers) if (!annotationBlock.includes(header)) found.push(`exact Built header missing: ${header}`);
  return found;
};

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
  const evidenceMutations = [
    ["reportsMatrix", '"id": "report.profit_per_truck"', '"id": "report.profit_per_truck.broken"'],
    ["driversMatrix", '"id": "settlements"', '"id": "settlements.broken"'],
    ["fleetMatrix", '"id": "unit.profile.maintenance"', '"id": "unit.profile.maintenance.broken"'],
    ["self", '"modules":["reports"],"cols":["reverse_link"],"leaves":["report.profit_per_truck"]', '"modules":["reports"],"cols":["connectivity"],"leaves":["report.profit_per_truck"]'],
    ["self", '"modules":["drivers"],"cols":["reverse_link"],"leaves":["settlements"]', '"modules":["drivers"],"cols":["connectivity"],"leaves":["settlements"]'],
    ["self", '"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.maintenance"]', '"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.maintenance"]'],
  ];
  for (const [key, before, after] of evidenceMutations) {
    if (!sources[key].includes(before)) throw new Error(`self-test fixture missing: ${key}`);
    if (!failures({ ...sources, [key]: sources[key].replace(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`verify-operating-report-entity-reverse-leaves: SELF-TEST PASS — ${checks.length + evidenceMutations.length} planted defects rejected`);
}

console.log(`verify-operating-report-entity-reverse-leaves: PASS — ${checks.length} report/entity reverse invariants`);
