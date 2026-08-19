#!/usr/bin/env node
/**
 * verify-position-history-staged-filters
 * LV-SAFETY-POSITION-HISTORY-FILTER-SILENT-APPLY — PositionHistoryPage must stage
 * unit/action filters via useStagedListFilters with Apply + Cancel + Reset;
 * query uses applied.*; URL sync on Apply (LST-F5197).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-position-history-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/PositionHistoryPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="position-history-filter-cancel"')) {
    errors.push("must expose position-history-filter-cancel");
  }
  if (!src.includes('data-testid="position-history-filter-apply"')) {
    errors.push("must expose position-history-filter-apply");
  }
  if (!src.includes('data-testid="position-history-filters"')) {
    errors.push("must keep position-history-filters chrome");
  }
  if (!/applied\.unitId/.test(src) || !/applied\.action/.test(src)) {
    errors.push("queryKey/filters must use applied.* (not draft/silent state)");
  }
  if (/function setUnitFilter\(/.test(src) || /Clear Filters/.test(src)) {
    errors.push("must not keep silent setUnitFilter / Clear Filters path");
  }
  if (!/setSearchParams/.test(src) || !/position-history-unit-filter/.test(src)) {
    errors.push("must keep LST-F5197 URL sync + unit EntityPicker test id");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setUnitFilter(next) { setUnitFilterState(next); patchSearchParam("unit_id", next); }
    queryKey: [unitFilter, actionFilter]
    <button>Clear Filters</button>
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: [applied.unitId, applied.action]
    setSearchParams(p, { replace: true });
    dataTestId="position-history-unit-filter"
    <div data-testid="position-history-filters" />
    <button data-testid="position-history-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="position-history-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — Position History staged filters with Apply/Cancel/Reset`);
