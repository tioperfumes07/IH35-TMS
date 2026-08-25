#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FILE = "apps/frontend/src/components/dispatch/FleetOosStrip.tsx";
const LABEL = "verify-dispatch-fleet-oos-read-recovery";

export function audit(source = readFileSync(join(ROOT, FILE), "utf8")) {
  const problems = [];
  if (!/fleetReadFailed\s*=\s*unitsQuery\.isError \|\| severeQuery\.isError/.test(source)) problems.push("unit and repair feeds must fail closed");
  if (!/fleetReadFailed \? \([\s\S]{0,900}data-fleet-oos-read-error/.test(source)) problems.push("failed feeds must render before loading/empty");
  if (!/unitsQuery\.isError\) void unitsQuery\.refetch\(\)/.test(source)) problems.push("unit roster lacks exact retry");
  if (!/severeQuery\.isError\) void severeQuery\.refetch\(\)/.test(source)) problems.push("repair estimates lack exact retry");
  if (!/Fleet availability was not treated as all units in service/.test(source)) problems.push("failure truth is not explicit");
  if (!/rows\.length === 0[\s\S]{0,180}All units in service/.test(source)) problems.push("honest all-in-service state was not preserved");
  if (!/fleetReadFailed \? ["']—["'] : rows\.length/.test(source)) problems.push("failed count must not render zero");
  return problems;
}

function selftest() {
  const good = `const fleetReadFailed = unitsQuery.isError || severeQuery.isError;
fleetReadFailed ? (<div data-fleet-oos-read-error>Fleet availability was not treated as all units in service.<button onClick={() => { if (unitsQuery.isError) void unitsQuery.refetch(); if (severeQuery.isError) void severeQuery.refetch(); }} /></div>) : rows.length === 0 ? <div>All units in service.</div> : null;
fleetReadFailed ? "—" : rows.length;`;
  const mutations = [
    good.replace(" || severeQuery.isError", ""),
    good.replace("data-fleet-oos-read-error", "data-error"),
    good.replace("unitsQuery.refetch()", "window.location.reload()"),
    good.replace("severeQuery.refetch()", "window.location.reload()"),
    good.replace("Fleet availability was not treated as all units in service.", "Unavailable"),
    good.replace("All units in service.", "No rows"),
    good.replace('fleetReadFailed ? "—" : rows.length', "rows.length"),
  ];
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  mutations.forEach((mutation, index) => { if (!audit(mutation).length) failures.push(`mutation ${index + 1} escaped`); });
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — ${mutations.length} mutations detected`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit();
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${LABEL}: ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — fleet OOS unit and repair feeds fail closed with exact recovery`);
}
