#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.driver_assign"],"task":"CLASS-F5906-HIDDEN-TRANSFER-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leaves":["report.customer_profitability"],"task":"CLASS-F5906-HIDDEN-TRANSFER-REVERSE-EXACT","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  fleetHistory: fs.readFileSync("apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx", "utf8").split("type UnitDriverHistoryStripProps")[0],
  fleetOverlaps: fs.readFileSync("apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx", "utf8").split("const overlapColumns")[1] ?? "",
  compliance: fs.readFileSync("apps/frontend/src/pages/compliance/HosTrackerSection.tsx", "utf8"),
  eld: fs.readFileSync("apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx", "utf8"),
  reports: fs.readFileSync("apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
  fleetMatrix: fs.readFileSync("docs/specs/scoreboard/modules/fleet.required.json", "utf8"),
  reportsMatrix: fs.readFileSync("docs/specs/scoreboard/modules/reports.required.json", "utf8"),
  feed: fs.readFileSync("docs/specs/scoreboard/wire-sprint-built.json", "utf8"),
  self: fs.readFileSync("scripts/verify-driver-customer-hidden-surface-reverse-links.mjs", "utf8"),
};

const FLEET_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.driver_assign"],"task":"CLASS-F5906-HIDDEN-TRANSFER-REVERSE-EXACT","vertical":"class-sweep"} */';
const REPORTS_HEADER = '/** @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leaves":["report.customer_profitability"],"task":"CLASS-F5906-HIDDEN-TRANSFER-REVERSE-EXACT","vertical":"class-sweep"} */';
const mutateLeaf = (source, id, mutate) => {
  const parsed = JSON.parse(source);
  const leaf = parsed.leaves.find((row) => row.id === id);
  mutate(leaf);
  return JSON.stringify(parsed);
};

const checks = [
  ["fleetHistory", /kind="driver" id=\{row\.driver_id\}/, "unit assignment history drills to its driver"],
  ["fleetOverlaps", /kind="driver" id=\{row\.driver_id\}/, "unit assignment overlaps drill to their driver"],
  ["compliance", /kind="driver" id=\{selectedDriver\.driver_id\}/, "HOS detail drawer drills to its driver"],
  ["eld", /kind="driver" id=\{row\.driver_id\}/, "ELD live-duty roster drills to its driver"],
  ["reports", /kind="customer" id=\{r\.customer_id\}/, "customer profitability drills to its customer"],
  ["entityLink", /case "driver":[\s\S]*?return `\/drivers\/\$\{id\}`/, "driver links resolve to the mounted profile"],
  ["entityLink", /case "customer":[\s\S]*?return `\/customers\/\$\{id\}`/, "customer links resolve to the mounted profile"],
];

const failures = (candidate) => {
  const found = checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
  for (const [matrixKey, id, route] of [
    ["fleetMatrix", "unit.profile.driver_assign", "/fleet/units/:id"],
    ["reportsMatrix", "report.customer_profitability", "/reports/customer-profitability"],
  ]) {
    let matrix;
    try { matrix = JSON.parse(candidate[matrixKey]); } catch (error) { found.push(`${matrixKey} parse: ${error.message}`); continue; }
    const leaf = matrix.leaves?.find((row) => row.id === id);
    if (!leaf?.required?.includes("reverse_link")) found.push(`${id} must require reverse_link`);
    if (leaf?.route_hint !== route) found.push(`${id} must name mounted route ${route}`);
  }
  const prefix = candidate.self.split('import fs from "node:fs";')[0];
  if (!prefix.includes(FLEET_HEADER)) found.push("exact Fleet hidden-reverse header missing");
  if (!prefix.includes(REPORTS_HEADER)) found.push("exact Reports profitability header missing");
  try { if (JSON.parse(candidate.feed).entries?.some((entry) => entry.guard === "scripts/verify-driver-customer-hidden-surface-reverse-links.mjs")) found.push("manual feed duplicates hidden reverse ownership"); }
  catch (error) { found.push(`feed parse: ${error.message}`); }
  return found;
};

const found = failures(sources);
if (found.length) {
  console.error(`verify-driver-customer-hidden-surface-reverse-links: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test") || process.argv.includes("--selftest")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-driver-customer-hidden-surface-reverse-links: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  const evidenceMutants = [
    { ...sources, fleetMatrix: mutateLeaf(sources.fleetMatrix, "unit.profile.driver_assign", (leaf) => { leaf.id += ".broken"; }) },
    { ...sources, fleetMatrix: mutateLeaf(sources.fleetMatrix, "unit.profile.driver_assign", (leaf) => { leaf.route_hint = "/broken"; }) },
    { ...sources, reportsMatrix: mutateLeaf(sources.reportsMatrix, "report.customer_profitability", (leaf) => { leaf.id += ".broken"; }) },
    { ...sources, reportsMatrix: mutateLeaf(sources.reportsMatrix, "report.customer_profitability", (leaf) => { leaf.route_hint = "/broken"; }) },
    { ...sources, self: sources.self.replace(FLEET_HEADER, FLEET_HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) },
    { ...sources, self: sources.self.replace(REPORTS_HEADER, REPORTS_HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) },
    { ...sources, feed: JSON.stringify({ entries: [{ guard: "scripts/verify-driver-customer-hidden-surface-reverse-links.mjs" }] }) },
  ];
  evidenceMutants.forEach((mutant, index) => {
    if (!failures(mutant).length) {
      console.error(`verify-driver-customer-hidden-surface-reverse-links: SELF-TEST FAIL — evidence mutation ${index + 1} escaped`);
      process.exit(1);
    }
  });
  console.log(`verify-driver-customer-hidden-surface-reverse-links: SELF-TEST PASS — ${checks.length + evidenceMutants.length}/${checks.length + evidenceMutants.length} runtime/evidence defects rejected`);
}

console.log(`verify-driver-customer-hidden-surface-reverse-links: PASS — ${checks.length} cross-module reverse-link invariants`);
