#!/usr/bin/env node
/**
 * verify-hos-violations-staged-filters
 * LV-SAFETY-HOS-VIOLATIONS-FILTER-SILENT-APPLY — HOSViolationsTab must stage driver/load
 * via useStagedListFilters with Apply + Cancel + Reset; query uses applied.*.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-hos-violations-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="hos-violations-filter-cancel"')) {
    errors.push("must expose hos-violations-filter-cancel");
  }
  if (!src.includes('data-testid="hos-violations-filter-apply"')) {
    errors.push("must expose hos-violations-filter-apply");
  }
  if (!src.includes('data-testid="hos-violations-filters"')) {
    errors.push("must keep hos-violations-filters chrome");
  }
  if (!/applied\.driverId/.test(src) || !/applied\.loadId/.test(src)) {
    errors.push("query must use applied.* (not silent URL write)");
  }
  if (
    !/hos-violations-filter-driver/.test(src) ||
    !/hos-violations-filter-load/.test(src) ||
    !/setDriverFilter/.test(src) ||
    !/setLoadFilter/.test(src) ||
    !/setSearchParams/.test(src)
  ) {
    errors.push("must keep LST-F5190 EntityPickers + setDriverFilter/setLoadFilter + URL sync");
  }
  if (/onChange=\{\(next\) => patchSearchParam\("driver_id"/.test(src) || /onChange=\{\(next\) => patchSearchParam\("load_id"/.test(src)) {
    errors.push("must not silent-write URL from EntityPicker onChange");
  }
  return errors;
}

function selftest() {
  const bad = `
    onChange={(next) => patchSearchParam("driver_id", next ?? "")}
    onChange={(next) => patchSearchParam("load_id", next ?? "")}
    queryKey: [loadIdFromUrl, driverIdFromUrl]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    function setDriverFilter(next) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    function setLoadFilter(next) { staged.setDraft((d) => ({ ...d, loadId: next })); }
    queryKey: [applied.loadId, applied.driverId]
    load_id: applied.loadId
    driver_id: applied.driverId
    dataTestId="hos-violations-filter-driver"
    dataTestId="hos-violations-filter-load"
    setSearchParams(p, { replace: true });
    <div data-testid="hos-violations-filters" />
    <button data-testid="hos-violations-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="hos-violations-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — HOSViolations staged filters with Apply/Cancel/Reset`);
