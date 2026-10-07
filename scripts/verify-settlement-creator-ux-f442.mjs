#!/usr/bin/env node
/**
 * SETL-F442 — Settlement Creator 5-column mock + decimals + period→load dates + no driver-name under picker.
 *
 * Owner 2026-10-07 Excel mock + Chrome:
 *   - Company + Driver sides use five equal columns (not 2-col stacked pairs)
 *   - Header is one 6-cell row (settlement / driver / truck / trailer / start / end)
 *   - Start → first load pickup; End → last load delivery
 *   - Miles/gallons accept typed decimals ("12." / "0.5") via DecimalNumberInput
 *   - Selected driver name must NOT render a second underlined EntityLink under the picker
 *     (that shoved Start Date down and made the header uneven)
 */
import { readFileSync, existsSync } from "node:fs";

const NAME = "verify-settlement-creator-ux-f442";
const DRAWER = "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx";

function run(src) {
  const out = [];
  if (!src) return [`RULE 0: ${DRAWER} missing`];

  if (!/fieldGridClass\s*=\s*"grid grid-cols-5 gap-2"/.test(src)) {
    out.push('RULE 1: fieldGridClass must be "grid grid-cols-5 gap-2" (owner 5-column mock).');
  }
  if (!/headerGridClass\s*=\s*"grid grid-cols-6 gap-2"/.test(src) || !/data-testid="sc-header-grid"/.test(src)) {
    out.push("RULE 2: header must use headerGridClass grid-cols-6 + data-testid sc-header-grid.");
  }

  // No EntityLink under the Driver picker (duplicate name that overlaps Start Date).
  if (/dataTestId="sc-driver"[\s\S]{0,400}<EntityLink/.test(src)) {
    out.push(
      "RULE 3: EntityLink still renders under sc-driver — remove it; the picker already shows the name.",
    );
  }
  if (/kind="driver"[\s\S]{0,600}EntityLink[\s\S]{0,200}kind="driver"/.test(src)) {
    out.push("RULE 3b: Driver field must not append a second EntityLink under the EntityPicker.");
  }

  if (!/function DecimalNumberInput/.test(src)) {
    out.push("RULE 4: DecimalNumberInput required — miles/gallons must keep typed decimals while focused.");
  }
  // data-testid may sit after a long title= prop — allow a wider window.
  if (
    !/sc-load-loaded-miles-/.test(src) ||
    !/<DecimalNumberInput[\s\S]{0,2000}sc-load-loaded-miles-/.test(src)
  ) {
    out.push("RULE 4b: Loaded miles must use DecimalNumberInput (not Number(e.target.value) mid-keystroke).");
  }
  if (!/<DecimalNumberInput[\s\S]{0,2000}sc-load-empty-miles-/.test(src)) {
    out.push("RULE 4c: Empty miles must use DecimalNumberInput.");
  }

  // Owner 2026-10-07 layout: Add under last item (not section header); Invoice Amt; load row groups; fuel auto-load.
  if (/function Section\([\s\S]{0,400}onAdd\?/.test(src)) {
    out.push("RULE 7: Section must NOT take onAdd — + Add belongs under the last item via AddUnderButton.");
  }
  if (!/function AddUnderButton/.test(src) || !/testId="sc-loads-add"/.test(src)) {
    out.push("RULE 7b: Loads + Add must be AddUnderButton with testId sc-loads-add (under the last load).");
  }
  if (!/label="Invoice Amt"/.test(src)) {
    out.push('RULE 8: Revenue label must be "Invoice Amt".');
  }
  if (!/sc-load-row1-|sc-load-row2-dates-|sc-load-miles-money-/.test(src)) {
    out.push("RULE 9: Load blocks must group row1 (Load#/Customer/Trip), row2 dates, miles/Invoice Amt.");
  }
  if (!/function fuelNeedsExplicitLoadNumber/.test(src) || !/function autoLoadNumberForExpenseDate/.test(src)) {
    out.push("RULE 10: Fuel load # auto-by-date; ask only on same-day PU+DEL+expense (fuelNeedsExplicitLoadNumber).");
  }
  if (!/sc-fuel-remove-/.test(src)) {
    out.push("RULE 11: Fuel lines must have a Remove (×) control.");
  }
  if (!/Loads carried from company/.test(src) || !/sc-drv-carry-load-/.test(src)) {
    out.push("RULE 12: Driver column must mirror company loads (load # / PU / miles / pay $/mi).");
  }
  // Old broken pattern on miles fields.
  if (/loaded_miles:\s*e\.target\.value\s*===\s*""\s*\?\s*null\s*:\s*Number\(e\.target\.value\)/.test(src)) {
    out.push("RULE 4d: loaded_miles still uses Number(e.target.value) — that kills trailing decimals.");
  }

  if (!/periodStart[\s\S]{0,200}pickup_date:\s*periodStart/.test(src) && !/pickup_date:\s*periodStart/.test(src)) {
    out.push("RULE 5: period Start must push onto first load pickup_date.");
  }
  if (!/delivery_date:\s*periodEnd/.test(src)) {
    out.push("RULE 5b: period End must push onto last load delivery_date.");
  }

  // Company→driver carry: new Drv lines take periodStart + defaultLoadNumber.
  if (!/date:\s*periodStart\s*\|\|\s*emptyDrvReimb\(\)\.date/.test(src)) {
    out.push("RULE 6: new driver reimbursements must inherit periodStart (company→driver, no double entry).");
  }

  return out;
}

if (process.argv.includes("--selftest")) {
  const good = `
const fieldGridClass = "grid grid-cols-5 gap-2";
const headerGridClass = "grid grid-cols-6 gap-2";
<div className={headerGridClass} data-testid="sc-header-grid">
function DecimalNumberInput() {}
function AddUnderButton() {}
function fuelNeedsExplicitLoadNumber() {}
function autoLoadNumberForExpenseDate() {}
<DecimalNumberInput data-testid={\`sc-load-loaded-miles-\${idx}\`} />
<DecimalNumberInput data-testid={\`sc-load-empty-miles-\${idx}\`} />
pickup_date: periodStart
delivery_date: periodEnd
date: periodStart || emptyDrvReimb().date
dataTestId="sc-driver"
/>
</Field>
label="Invoice Amt"
sc-load-row1- sc-load-row2-dates- sc-load-miles-money-
testId="sc-loads-add"
sc-fuel-remove-
Loads carried from company
sc-drv-carry-load-
`;
  const bad = `
const fieldGridClass = "grid grid-cols-2 gap-2";
dataTestId="sc-driver"
/>
{driverId ? (
  <EntityLink kind="driver" id={driverId} label="X" className="mt-1 block" />
) : null}
loaded_miles: e.target.value === "" ? null : Number(e.target.value),
`;
  const cases = [
    ["fixed tree passes", good, 0],
    ["catches old defects", bad, 16],
  ];
  let ok = 0;
  for (const [label, src, expected] of cases) {
    const got = run(src).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}\n  ${run(src).join("\n  ")}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const failures = run(existsSync(DRAWER) ? readFileSync(DRAWER, "utf8") : null);
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(
  `${NAME}: PASS — 5-col; header 6-col; no driver EntityLink; decimals; period→load; Add under items; Invoice Amt; fuel auto-load; drv carry.`,
);
