#!/usr/bin/env node
/**
 * DISPATCH #18 / system-wide (owner 2026-09-04): "In the headers, adjust text size, all text must
 * fit horizontally. In 1 row, no row on top of another." ParityTable header <th> had no
 * white-space control, so a two-word column label wrapped onto a second line inside the fixed 30px
 * header row — the owner's "one row on top of another." Header cells must render on ONE row
 * (whitespace-nowrap); the auto-fit column sizing widens the column to the header label.
 *
 * Self-testing static guard. Run: node scripts/verify-parity-table-header-one-row.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/parity/ParityTable.tsx";
const original = fs.readFileSync(file, "utf8");

const contracts = [
  [
    "header <th> is whitespace-nowrap (labels never wrap to a second row)",
    (s) => /className=\{`relative whitespace-nowrap px-2 font-semibold uppercase/.test(s),
    (s) => s.replace("relative whitespace-nowrap px-2 font-semibold uppercase", "relative px-2 font-semibold uppercase"),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-parity-table-header-one-row] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-parity-table-header-one-row] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-parity-table-header-one-row] OK");
