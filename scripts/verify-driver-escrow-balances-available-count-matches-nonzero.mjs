#!/usr/bin/env node
// DRIVER-ESCROW-VISUALIZER-BALANCES-AVAILABLE-LABEL-MISLEADING-COUNT — guard
//
// /banking/driver-escrow's "Driver balances available" stat used to show `driverRows.length` — the
// API deliberately returns EVERY active driver (so the picker can reach a $0 driver's timeline), so
// this always showed the total driver roster count (87), not drivers who actually have escrow
// money. The Banking Home dashboard's "Drivers with escrow:" widget, consuming the identical
// underlying data, correctly filters to nonzero balances first (yielding 1) — an 87x contradiction
// between two live surfaces on the same number. This guard fails if the label reverts to the raw,
// unfiltered driverRows.length.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx";

export function check(text) {
  const failures = [];
  if (!/driversWithEscrowBalance\s*=\s*driverRows\.filter\(\s*\(row\)\s*=>\s*Number\(row\.escrow_balance\)\s*>\s*0\s*\)\.length/.test(text)) {
    failures.push(`${FILE} no longer computes driversWithEscrowBalance as a nonzero-balance filter over driverRows`);
  }
  if (/Driver balances available<\/p>\s*<p[^>]*>\{driverRows\.length\}/.test(text)) {
    failures.push(`${FILE} "Driver balances available" stat reverted to the raw, unfiltered driverRows.length`);
  }
  if (!/Driver balances available<\/p>\s*<p[^>]*>\{driversWithEscrowBalance\}/.test(text)) {
    failures.push(`${FILE} "Driver balances available" stat no longer renders the filtered driversWithEscrowBalance count`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: driver-escrow-balances-available-count-matches-nonzero");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: 'Driver balances available' counts drivers with a nonzero escrow balance, matching Banking Home's 'Drivers with escrow:' semantics");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace("{driversWithEscrowBalance}", "{driverRows.length}");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to raw driverRows.length) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
