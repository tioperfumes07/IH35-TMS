#!/usr/bin/env node
// STEP-1.3a guard (owner/lead order 2026-09-05, live-measured on load 13508): the Load Costs board
// must not truncate or wrap, and its rate/status/pill formatting is locked. The measured defects:
//   4. Rate Loaded/Empty render dollars-per-mile, four decimals ($0.0000), never "¢/mi"
//   5. a load that has not departed pickup reads "Booked", never "In transit"
//   6. money & mileage cells never wrap (whitespace-nowrap on the numeric column class)
//   7. filter pills are square (rounded-sm), never rounded-full
//
// Header WEIGHT is intentionally NOT asserted here: DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05
// reverted the earlier 400 to 700 ("regular COLOR text" = dark ink, not weight). Header weight,
// group-band shade, and body tints are owned by scripts/verify-table-design-contract.mjs.
//
// Usage: node scripts/verify-load-costs-board-no-truncation-no-wrap.mjs [--selftest]

import { readFileSync } from "node:fs";

const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";

function auditBoard(src) {
  const f = [];
  // Defect 4: rate is dollars-per-mile, 4 decimals; the old ¢/mi format is gone from the fmtRate body.
  const rateLine = src.split("\n").find((l) => l.includes("const fmtRate =")) ?? "";
  if (/¢\/mi/.test(rateLine)) f.push(`${BOARD}: fmtRate still renders "¢/mi" — must be dollars-per-mile ($0.0000)`);
  if (!/const fmtRate =[^\n]*toFixed\(4\)/.test(src)) f.push(`${BOARD}: fmtRate must format to four decimals (toFixed(4))`);
  // Defect 5: "Booked" branch for a non-departed load.
  if (!/label:\s*"Booked"/.test(src)) f.push(`${BOARD}: serviceStatus must have a "Booked" branch for loads that have not departed pickup`);
  // L.1b / DESIGN-CONTRACT §20 "a dash is not a zero": the trip-expense cost columns render a dash
  // (never $0.00) when nothing of that kind was recorded. fmtDash must exist and be used for all five.
  if (!/const fmtDash =\s*\(c: number\)\s*=>\s*\(c \? fmt\(c\)\s*:\s*DASH\)/.test(src))
    f.push(`${BOARD}: fmtDash must render a dash for zero (c ? fmt(c) : DASH)`);
  for (const cents of ["late_fee_cents", "lumper_cents", "fuel_cents", "repairs_maintenance_cents", "other_cost_cents"]) {
    if (!new RegExp(`render: r => fmtDash\\(Number\\(r\\.${cents}\\)\\)`).test(src))
      f.push(`${BOARD}: cost column ${cents} must render via fmtDash (dash-not-zero)`);
  }
  // Defect 6: money/mileage columns nowrap.
  if (!/const NUM\s*=\s*"[^"]*whitespace-nowrap[^"]*"/.test(src))
    f.push(`${BOARD}: the numeric column class (NUM) must include whitespace-nowrap`);
  if (/className:\s*"text-center \[font-variant-numeric:tabular-nums\]"/.test(src))
    f.push(`${BOARD}: a numeric column still uses the wrapping class instead of NUM`);
  // Defect 7: square pills — no rounded-full anywhere in the filter-pill mapper.
  const pillMapper = src.split("\n").find((l) => l.includes("load-costs-pill-") && l.includes("<button")) ?? "";
  if (/rounded-full/.test(pillMapper))
    f.push(`${BOARD}: filter pills must be square (rounded-sm), never rounded-full`);
  if (!/rounded-sm/.test(pillMapper))
    f.push(`${BOARD}: filter pills must use a square rounded-sm class`);
  // L.1c (DESIGN-CONTRACT §14): the 19-column board must not compress below min-width 1660 —
  // it scrolls horizontally in the overflow-x wrapper instead of truncating columns.
  if (!/minWidthPx=\{1660\}/.test(src))
    f.push(`${BOARD}: ParityTable must be given minWidthPx={1660} so wide columns scroll, not truncate`);
  // FAIL-3 (lead 03:06Z / DESIGN-CONTRACT §20): an UNTRACKED mileage/rate/deadhead cell renders a
  // dash, never blank. fmtMiles/fmtRate return DASH on null; deadhead_pay renders DASH on null.
  if (!/const fmtMiles =[^\n]*m == null \? DASH/.test(src))
    f.push(`${BOARD}: fmtMiles must render a dash (not "") when mileage is untracked (null)`);
  if (!/const fmtRate =[^\n]*c == null \? DASH/.test(src))
    f.push(`${BOARD}: fmtRate must render a dash (not "") when the rate is untracked (null)`);
  const deadheadLine = src.split("\n").find((l) => l.includes('key: "deadhead_pay"')) ?? "";
  if (!/deadhead_pay_cents == null \? DASH/.test(deadheadLine))
    f.push(`${BOARD}: deadhead_pay must render a dash (not blank) when untracked (null)`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const boardSrc = readFileSync(BOARD, "utf8");

  const failures = auditBoard(boardSrc);
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
    const m4 = boardSrc.replace(/render: r => fmtDash\(Number\(r\.late_fee_cents\)\)/, "render: r => fmt(Number(r.late_fee_cents))");
    if (auditBoard(m4).length === 0) { console.error("SELFTEST FAIL: reverting a cost cell to fmt (zero) did not trip"); process.exit(1); }
    const m3 = boardSrc.replace(/data-testid=\{`load-costs-pill-\$\{id\}`\}([^\n]*)rounded-sm/, "data-testid={`load-costs-pill-${id}`}$1rounded-full");
    if (auditBoard(m3).length === 0) { console.error("SELFTEST FAIL: rounded-full pill did not trip"); process.exit(1); }
    const m5 = boardSrc.replace(/minWidthPx=\{1660\}/, "");
    if (auditBoard(m5).length === 0) { console.error("SELFTEST FAIL: removing minWidthPx did not trip"); process.exit(1); }
    const m6 = boardSrc.replace(/const fmtMiles = \(m: string \| null\) => \(m == null \? DASH/, "const fmtMiles = (m: string | null) => (m == null ? \"\"");
    if (auditBoard(m6).length === 0) { console.error("SELFTEST FAIL: reverting fmtMiles dash to blank did not trip"); process.exit(1); }
    const m7 = boardSrc.replace(/deadhead_pay_cents == null \? DASH/, "deadhead_pay_cents == null ? \"\"");
    if (auditBoard(m7).length === 0) { console.error("SELFTEST FAIL: reverting deadhead dash to blank did not trip"); process.exit(1); }
    console.log("SELFTEST OK: guard trips on all mutations");
  }

  console.log("PASS verify-load-costs-board-no-truncation-no-wrap");
}

main();
