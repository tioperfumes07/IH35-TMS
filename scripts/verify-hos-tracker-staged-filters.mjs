#!/usr/bin/env node
/**
 * verify-hos-tracker-staged-filters
 * LV-HOS-TRACKER-FILTER-SILENT-APPLY — HosTrackerSection driver filter must stage via
 * useStagedListFilters with Apply + Cancel + Reset; roster filter uses applied/effectiveDriverId;
 * keep requestedDriverId = searchParams.get("driver_id") + LST-F5171 reverse chrome.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-hos-tracker-staged-filters";
const TARGET = "apps/frontend/src/pages/compliance/HosTrackerSection.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="hos-tracker-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="hos-tracker-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="hos-tracker-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="hos-tracker-filter-driver"')) errors.push("must keep driver picker testid");
  if (!/allowCreate=\{false\}/.test(src)) errors.push("must keep allowCreate={false}");
  if (!/requestedDriverId\s*=\s*searchParams\.get\("driver_id"\)/.test(src)) {
    errors.push('must keep requestedDriverId = searchParams.get("driver_id")');
  }
  if (!/driver\.driver_id === effectiveDriverId/.test(src) || !/filteredDrivers/.test(src)) {
    errors.push("must keep effectiveDriverId roster filter + filteredDrivers");
  }
  if (!/setSearchParams/.test(src) || !/setDriverFilter/.test(src)) {
    errors.push("must keep setDriverFilter + setSearchParams URL sync");
  }
  if (/const \[driverPickerId,\s*setDriverPickerId\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const requestedDriverId = searchParams.get("driver_id");
    const [driverPickerId, setDriverPickerId] = useState("");
    const setDriverFilter = (driverId) => { setDriverPickerId(driverId); setSearchParams(...); };
    driver.driver_id === effectiveDriverId
    filteredDrivers
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const requestedDriverId = searchParams.get("driver_id");
    const effectiveDriverId = applied.driverId.trim() || undefined;
    driver.driver_id === effectiveDriverId
    filteredDrivers
    const setDriverFilter = (driverId) => { staged.setDraft((d) => ({ ...d, driverId })); };
    setSearchParams
    allowCreate={false}
    dataTestId="hos-tracker-filter-driver"
    <button data-testid="hos-tracker-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="hos-tracker-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="hos-tracker-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — hos tracker staged filters`);
