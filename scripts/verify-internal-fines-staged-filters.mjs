#!/usr/bin/env node
/**
 * verify-internal-fines-staged-filters
 * LV-SAFETY-INTERNAL-FINES-FILTER-SILENT-APPLY — InternalFinesPage must stage
 * driver/load filters via useStagedListFilters with Apply + Cancel + Reset;
 * query uses applied.*; URL on Apply (LST-F5191).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-internal-fines-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="internal-fines-filter-cancel"')) {
    errors.push("must expose internal-fines-filter-cancel");
  }
  if (!src.includes('data-testid="internal-fines-filter-apply"')) {
    errors.push("must expose internal-fines-filter-apply");
  }
  if (!src.includes('data-testid="internal-fines-filters"')) {
    errors.push("must keep internal-fines-filters chrome");
  }
  if (!/applied\.driverId/.test(src) || !/applied\.loadId/.test(src)) {
    errors.push("query must use applied.* (not silent draft)");
  }
  if (
    !/setSearchParams/.test(src) ||
    !/setDriverFilter/.test(src) ||
    !/setLoadFilter/.test(src) ||
    !/loadIdFromUrl/.test(src) ||
    !/effectiveLoadId/.test(src)
  ) {
    errors.push("must keep LST-F5191 URL sync + sibling reverse filter names");
  }
  if (!/internal-fines-filter-driver/.test(src) || !/internal-fines-filter-load/.test(src)) {
    errors.push("must keep EntityPicker test ids");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setDriverFilter(next) { setDriverFilterState(next); patchSearchParam("driver_id", next); }
    queryKey: [driverFilter, loadFilter]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: [applied.driverId, applied.loadId]
    const loadIdFromUrl = searchParams.get("load_id");
    const effectiveLoadId = applied.loadId.trim() || undefined;
    function setDriverFilter(next) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    function setLoadFilter(next) { staged.setDraft((d) => ({ ...d, loadId: next })); }
    setSearchParams(p, { replace: true });
    dataTestId="internal-fines-filter-driver"
    dataTestId="internal-fines-filter-load"
    <div data-testid="internal-fines-filters" />
    <button data-testid="internal-fines-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="internal-fines-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — Internal Fines staged filters with Apply/Cancel/Reset`);
