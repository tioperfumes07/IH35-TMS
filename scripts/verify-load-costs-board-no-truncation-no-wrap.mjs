#!/usr/bin/env node
// STEP-1.3a guard (owner/lead order 2026-09-05, live-measured on load 13508): the Load Costs board
// must not truncate or wrap. Locks the seven measured defects:
//   2. header weight REGULAR (400), not 700 — board passes headerWeight to ParityTable, which honors it
//   4. Rate Loaded/Empty render dollars-per-mile, four decimals ($0.0000), never "¢/mi"
//   5. a load that has not departed pickup reads "Booked", never "In transit"
//   6. money & mileage cells never wrap (whitespace-nowrap on the numeric column class)
//   7. filter pills are square (rounded-sm), not rounded-full
//
// Usage: node scripts/verify-load-costs-board-no-truncation-no-wrap.mjs [--selftest]

import { readFileSync } from "node:fs";

const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const PARITY = "apps/frontend/src/components/parity/ParityTable.tsx";

function auditBoard(src) {
  const f = [];
  // Defect 4: rate is dollars-per-mile, 4 decimals; the old ¢/mi format is gone from the fmtRate body.
  const rateLine = src.split("\n").find((l) => l.includes("const fmtRate =")) ?? "";
  if (/¢\/mi/.test(rateLine)) f.push(`${BOARD}: fmtRate still renders "¢/mi" — must be dollars-per-mile ($0.0000)`);
  if (!/const fmtRate =[^\n]*toFixed\(4\)/.test(src)) f.push(`${BOARD}: fmtRate must format to four decimals (toFixed(4))`);
  // Defect 5: "Booked" branch for a non-departed load.
  if (!/label:\s*"Booked"/.test(src)) f.push(`${BOARD}: serviceStatus must have a "Booked" branch for loads that have not departed pickup`);
  // Defect 6: money/mileage columns nowrap.
  if (!/const NUM\s*=\s*"[^"]*whitespace-nowrap[^"]*"/.test(src))
    f.push(`${BOARD}: the numeric column class (NUM) must include whitespace-nowrap`);
  if (/className:\s*"text-center \[font-variant-numeric:tabular-nums\]"/.test(src))
    f.push(`${BOARD}: a numeric column still uses the wrapping class instead of NUM`);
  // Defect 7: square pills — the pill button className must be the square rounded-sm variant, and the
  // old rounded-full navy class must be gone.
  if (/rounded-full border px-3 py-1 text-xs/.test(src))
    f.push(`${BOARD}: filter pills must be square (rounded-sm), not the old rounded-full navy class`);
  if (!/rounded-sm border px-3 text-xs/.test(src))
    f.push(`${BOARD}: filter pills must use the square "rounded-sm border px-3 text-xs" class`);
  // Defect 2: board opts into regular header weight.
  if (!/headerWeight=\{400\}/.test(src)) f.push(`${BOARD}: board must pass headerWeight={400} to ParityTable`);
  return f;
}

function auditParity(src) {
  const f = [];
  if (!/headerWeight\?:\s*number;/.test(src)) f.push(`${PARITY}: must declare an opt-in headerWeight?: number prop`);
  const applied = (src.match(/fontWeight:\s*headerWeight\s*\?\?\s*700/g) ?? []).length;
  if (applied < 2) f.push(`${PARITY}: headerWeight must drive fontWeight on both header rows (found ${applied}/2)`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const boardSrc = readFileSync(BOARD, "utf8");
  const paritySrc = readFileSync(PARITY, "utf8");

  const failures = [...auditBoard(boardSrc), ...auditParity(paritySrc)];
  if (failures.length) {
    console.error("FAIL verify-load-costs-board-no-truncation-no-wrap:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const m1 = boardSrc.replace(/const fmtRate =([^\n]*)toFixed\(4\)/, "const fmtRate =$1toFixed(2)");
    if (auditBoard(m1).length === 0) { console.error("SELFTEST FAIL: reverting rate format did not trip"); process.exit(1); }
    const m2 = boardSrc.replace(/label:\s*"Booked"/, 'label: "In transit"');
    if (auditBoard(m2).length === 0) { console.error("SELFTEST FAIL: removing Booked branch did not trip"); process.exit(1); }
    const m3 = paritySrc.replaceAll("fontWeight: headerWeight ?? 700", "fontWeight: 700");
    if (auditParity(m3).length === 0) { console.error("SELFTEST FAIL: hardcoding header weight did not trip"); process.exit(1); }
    console.log("SELFTEST OK: guard trips on all mutations");
  }

  console.log("PASS verify-load-costs-board-no-truncation-no-wrap");
}

main();
