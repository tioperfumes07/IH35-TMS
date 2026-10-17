#!/usr/bin/env node
// DRIVER-ESCROW-VISUALIZER-BALANCES-AVAILABLE-LABEL-MISLEADING-COUNT — guard
//
// /banking/driver-escrow's "Driver balances available" stat used to show `driverRows.length` — the
// API deliberately returns EVERY active driver (so the picker can reach a $0 driver's timeline), so
// this always showed the total driver roster count (87), not drivers who actually have escrow
// money. The Banking Home dashboard's "Drivers with escrow:" widget, consuming the identical
// underlying data, correctly filters to nonzero balances first (yielding 1) — an 87x contradiction
// between two live surfaces on the same number. This guard fails if the count reverts to the raw,
// unfiltered row count.
//
// 443.187 (CC-2) REPOINT — same rule, current surface. BANK-F26429 (650f1c8104, #23060) replaced the old header
// stat, and the owner-approved C-64 boards (25803d65b2, #23592 "Banking approved boards") split the tab into
// DriverEscrowBoardSection + DriverEscrowLedgerSection; DriverEscrowTabContent.tsx is now a 26-line container with no
// count at all. The "drivers with a balance" count now lives in both sections' summary lines ("… across N driver(s)
// with a balance"). Each must be a NONZERO-balance filter over its rows — never the raw row count.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BOARD = "apps/frontend/src/pages/banking/components/DriverEscrowBoardSection.tsx";
const LEDGER = "apps/frontend/src/pages/banking/components/DriverEscrowLedgerSection.tsx";

/** The JSX expression immediately before " driver(s) with a balance" in a file. */
function countExpression(text) {
  const at = text.indexOf("driver(s) with a balance");
  if (at < 0) return null;
  const before = text.slice(Math.max(0, at - 260), at).replace(/\{"\s*"\}\s*$/, "");
  const m = before.match(/across\s*\{([\s\S]*)\}\s*$/);
  return m ? m[1] : null;
}

export function check(files) {
  const failures = [];
  const board = countExpression(files[BOARD] ?? "");
  if (board == null) failures.push(`${BOARD}: the "driver(s) with a balance" count is gone`);
  else if (!/\.filter\(\s*\(\w+\)\s*=>\s*\w+\.held\s*!==\s*0\s*\)\.length$/.test(board.trim())) {
    failures.push(`${BOARD}: the "driver(s) with a balance" count is not a nonzero-balance filter (got {${board.trim()}})`);
  }
  const ledger = countExpression(files[LEDGER] ?? "");
  if (ledger == null) failures.push(`${LEDGER}: the "driver(s) with a balance" count is gone`);
  else if (!/\.filter\(\s*\(\w+\)\s*=>\s*Number\(\w+\.escrow_balance\s*\?\?\s*0\)\s*!==\s*0\s*\)\.length$/.test(ledger.trim())) {
    failures.push(`${LEDGER}: the "driver(s) with a balance" count is not a nonzero-balance filter (got {${ledger.trim()}})`);
  }
  return failures;
}

function load() {
  return {
    [BOARD]: fs.readFileSync(path.join(root, BOARD), "utf8"),
    [LEDGER]: fs.readFileSync(path.join(root, LEDGER), "utf8"),
  };
}

function run() {
  const failures = check(load());
  if (failures.length > 0) {
    console.error("FAIL: driver-escrow-balances-available-count-matches-nonzero");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: every 'driver(s) with a balance' count on the Driver Escrow tab counts drivers with a nonzero escrow balance, matching Banking Home's 'Drivers with escrow:' semantics");
}

function selftest() {
  const files = load();
  if (check(files).length) {
    console.error("FAIL(selftest): baseline not clean", check(files));
    process.exit(1);
  }
  const plants = [
    ["board count reverted to raw row count", { ...files, [BOARD]: files[BOARD].replace(/\{enrichedRows\.filter\(\(d\) => d\.held !== 0\)\.length\}/, "{enrichedRows.length}") }],
    ["ledger count reverted to raw row count", { ...files, [LEDGER]: files[LEDGER].replace(/\.filter\(\(d\) => Number\(d\.escrow_balance \?\? 0\) !== 0\)\.length/, ".length") }],
    ["board count removed", { ...files, [BOARD]: files[BOARD].replace("driver(s) with a balance", "drivers") }],
  ];
  for (const [name, f] of plants) {
    if (JSON.stringify(f) === JSON.stringify(files)) {
      console.error(`FAIL(selftest): plant "${name}" did not change the source`);
      process.exit(1);
    }
    if (check(f).length === 0) {
      console.error(`FAIL(selftest): plant "${name}" was NOT caught`);
      process.exit(1);
    }
  }
  console.log(`PASS(selftest): ${plants.length} planted regressions caught; baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
