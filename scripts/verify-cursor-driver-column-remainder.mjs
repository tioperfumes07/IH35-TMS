#!/usr/bin/env node
/**
 * Cursor driver-column remainder — drawers/panels with real driver scope or EntityLink.
 *
 * @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^(profiles\\.drawer\\.(equipment_qualification|safety_event)|drivers\\.panel\\.(auto_deduction_policies|team_split_config))$","task":"CURSOR-DRIVER-COLUMN-REMAINDER","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["driver"],"leafRe":"^settlements\\.panel\\.open_driver_bills$","task":"CURSOR-DRIVER-COLUMN-SETTLEMENTS-OPEN-BILLS","vertical":"column-wave"}
 *
 * Run: node scripts/verify-cursor-driver-column-remainder.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cursor-driver-column-remainder";

const FILES = {
  driverDetail: "apps/frontend/src/pages/DriverDetail.tsx",
  autoDeduction: "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx",
  teamSplit: "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx",
  settlements: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
  driversMatrix: "docs/specs/scoreboard/modules/drivers.required.json",
  settlementsMatrix: "docs/specs/scoreboard/modules/settlements.required.json",
};

const CHECKS = [
  ["driverDetail", 'title="Create Equipment Qualification"', "equipment qualification drawer must remain on DriverDetail"],
  ["driverDetail", 'title="Create Safety Event"', "safety event drawer must remain on DriverDetail"],
  ["driverDetail", 'kind="driver"', "DriverDetail must retain EntityLink kind=driver (self/prior)"],
  ["autoDeduction", '<EntityLink kind="driver" id={row.driver_id}', "auto-deduction policies must drill driver"],
  ["teamSplit", '<EntityLink kind="driver" id={row.primary_driver_id}', "team split must drill primary driver"],
  ["teamSplit", '<EntityLink kind="driver" id={row.secondary_driver_id}', "team split must drill secondary driver"],
  ["settlements", 'kind="driver"', "open driver bills panel must drill driver"],
  ["settlements", "open_driver_bills", "settlements open-driver-bills panel must remain wired"],
];

const REQUIRED_LEAVES = [
  ["driversMatrix", "profiles.drawer.equipment_qualification"],
  ["driversMatrix", "profiles.drawer.safety_event"],
  ["driversMatrix", "drivers.panel.auto_deduction_policies"],
  ["driversMatrix", "drivers.panel.team_split_config"],
  ["settlementsMatrix", "settlements.panel.open_driver_bills"],
];

function readAll() {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(ROOT, f), "utf8")]));
}

export function verify(source) {
  const failures = [];
  for (const [key, token, msg] of CHECKS) {
    if (!source[key]?.includes(token)) failures.push(msg);
  }
  for (const [key, id] of REQUIRED_LEAVES) {
    let matrix;
    try {
      matrix = JSON.parse(source[key]);
    } catch {
      failures.push(`${FILES[key]} must remain valid JSON`);
      continue;
    }
    const leaf = matrix.leaves?.find((l) => l.id === id);
    if (!leaf) failures.push(`${id}: leaf missing from matrix`);
    else if (!leaf.required?.includes("driver")) failures.push(`${id}: must retain driver Required`);
  }
  return failures;
}

const source = readAll();
const failures = verify(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  CHECKS.forEach(([key, token], i) => {
    const mutant = { ...source, [key]: source[key].replaceAll(token, `BROKEN_${i}`) };
    if (!verify(mutant).length) throw new Error(`selftest mutation ${i + 1} survived`);
  });
  console.log(`${LABEL} --selftest OK`);
}

console.log(`${LABEL} PASS — driver-column drawer/panel remainder Built-honest`);
