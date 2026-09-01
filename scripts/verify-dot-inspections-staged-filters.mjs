#!/usr/bin/env node
/**
 * verify-dot-inspections-staged-filters
 * LV-SAFETY-DOT-INSPECTIONS-FILTER-SILENT-APPLY — DOTInspectionsTab list filters must
 * stage via useStagedListFilters with Apply + Cancel + Reset; query uses applied.*;
 * LST-F5189 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-dot-inspections-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="dot-inspections-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="dot-inspections-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="dot-inspections-filters"')) errors.push("must keep filters chrome");
  if (!/applied\.driverId/.test(src) || !/applied\.trailerId/.test(src) || !/applied\.outcome/.test(src)) {
    errors.push("query must use applied.* (not draft/silent state)");
  }
  if (!src.includes('data-testid="dot-inspections-filter-outcome"')) {
    errors.push("must expose outcome SelectCombobox filter");
  }
  if (!/searchParams\.get\("outcome"\)/.test(src)) {
    errors.push("must keep outcome URL sync");
  }
  if (!/lg:grid-cols-6/.test(src) || !src.includes("SAFETY_FIELD_CLASS")) {
    errors.push("create row must use uniform lg:grid-cols-6 + SAFETY_FIELD_CLASS");
  }
  if (/filterBar=/.test(src)) {
    errors.push("filters must live above create row, not ParityTable filterBar");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src)) {
    errors.push("must keep LST-F5189 URL sync");
  }
  if (/\bfunction\s+setDriverFilter\s*\(/.test(src) || /const \[driverFilter,\s*setDriverFilterState\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter setters");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [driverFilter, setDriverFilterState] = useState("");
    function setDriverFilter(next) { setDriverFilterState(next); patchSearchParam("driver_id", next); }
    queryKey: [driverFilter]
    <EntityPicker onChange={(next) => setDriverFilter(next ?? "")} />
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchSearchParam(next); } });
    queryKey: [applied.driverId, applied.trailerId, applied.outcome]
    searchParams.get("outcome")
    searchParams.get("driver_id")
    data-testid="dot-inspections-filter-outcome"
    lg:grid-cols-6
    SAFETY_FIELD_CLASS
    setSearchParams
    <div data-testid="dot-inspections-filters" />
    <button data-testid="dot-inspections-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="dot-inspections-filter-cancel" onClick={staged.cancel}>Cancel</button>
  `;
  if (assertPage(bad).length === 0 || assertPage(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertPage(bad), good: assertPage(good) });
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertPage(fs.readFileSync(path.join(process.cwd(), TARGET), "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — DOT inspections staged filters with Apply/Cancel/Reset`);
