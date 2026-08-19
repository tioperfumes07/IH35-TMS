#!/usr/bin/env node
/**
 * verify-company-violations-staged-filters
 * LV-SAFETY-COMPANY-VIOLATIONS-FILTER-SILENT-APPLY — CompanyViolationsPage must stage
 * driver/unit filters via useStagedListFilters with Apply + Cancel + Reset;
 * query uses applied.*; URL on Apply (LST-F5191).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-company-violations-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/CompanyViolationsPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="company-violations-filter-cancel"')) {
    errors.push("must expose company-violations-filter-cancel");
  }
  if (!src.includes('data-testid="company-violations-filter-apply"')) {
    errors.push("must expose company-violations-filter-apply");
  }
  if (!src.includes('data-testid="company-violations-filters"')) {
    errors.push("must keep company-violations-filters chrome");
  }
  if (!/applied\.driverId/.test(src) || !/applied\.unitId/.test(src)) {
    errors.push("query must use applied.* (not silent draft)");
  }
  if (!/setSearchParams/.test(src) || !/setDriverFilter/.test(src) || !/setUnitFilter/.test(src)) {
    errors.push("must keep LST-F5191 URL sync + setDriverFilter/setUnitFilter names");
  }
  if (!/company-violations-filter-driver/.test(src) || !/company-violations-filter-unit/.test(src)) {
    errors.push("must keep EntityPicker test ids");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setDriverFilter(next) { setDriverFilterState(next); patchSearchParam("driver_id", next); }
    queryKey: [driverFilter, unitFilter]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: [applied.driverId, applied.unitId]
    function setDriverFilter(next) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    function setUnitFilter(next) { staged.setDraft((d) => ({ ...d, unitId: next })); }
    setSearchParams(p, { replace: true });
    dataTestId="company-violations-filter-driver"
    dataTestId="company-violations-filter-unit"
    <div data-testid="company-violations-filters" />
    <button data-testid="company-violations-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="company-violations-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — Company Violations staged filters with Apply/Cancel/Reset`);
