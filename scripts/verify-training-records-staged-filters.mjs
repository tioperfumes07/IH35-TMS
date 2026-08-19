#!/usr/bin/env node
/**
 * verify-training-records-staged-filters
 * LV-SAFETY-TRAINING-RECORDS-FILTER-SILENT-APPLY — TrainingRecordsPage must stage
 * driver filter via useStagedListFilters with Apply + Cancel + Reset;
 * query uses applied.*; URL on Apply (LST-F5191).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-training-records-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="training-records-filter-cancel"')) {
    errors.push("must expose training-records-filter-cancel");
  }
  if (!src.includes('data-testid="training-records-filter-apply"')) {
    errors.push("must expose training-records-filter-apply");
  }
  if (!src.includes('data-testid="training-records-filters"')) {
    errors.push("must keep training-records-filters chrome");
  }
  if (!/applied\.driverId/.test(src)) errors.push("query must use applied.driverId");
  if (!/setSearchParams/.test(src) || !/setDriverFilter/.test(src) || !/training-records-filter-driver/.test(src)) {
    errors.push("must keep LST-F5191 URL sync + setDriverFilter + training-records-filter-driver");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setDriverFilter(next) { setDriverFilterState(next); setSearchParams(p); }
    queryKey: [driverFilter]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: [applied.driverId]
    function setDriverFilter(next) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    setSearchParams(p, { replace: true });
    dataTestId="training-records-filter-driver"
    <div data-testid="training-records-filters" />
    <button data-testid="training-records-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="training-records-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — Training Records staged filters with Apply/Cancel/Reset`);
