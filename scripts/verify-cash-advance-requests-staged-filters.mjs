#!/usr/bin/env node
/**
 * verify-cash-advance-requests-staged-filters
 * LV-DRIVER-FINANCE-CASH-ADVANCE-REQUESTS-FILTER-SILENT-APPLY — CashAdvanceRequestsPage driver
 * filter must stage via useStagedListFilters with Apply + Cancel + Reset; query uses applied.*;
 * LST-F5175 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-cash-advance-requests-staged-filters";
const TARGET = "apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="cash-advance-requests-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="cash-advance-requests-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="cash-advance-requests-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="cash-advance-requests-filter-driver"')) errors.push("must keep driver picker testid");
  if (!/effectiveDriverId/.test(src) || !/applied\.driverId/.test(src)) {
    errors.push("query must use applied/effectiveDriverId");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src) || !/setDriverFilter/.test(src)) {
    errors.push("must keep LST-F5175 setDriverFilter + setSearchParams URL sync");
  }
  if (/const \[driverPickerId,\s*setDriverPickerId\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [driverPickerId, setDriverPickerId] = useState("");
    const setDriverFilter = (driverId) => { setDriverPickerId(driverId); setSearchParams(...); };
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const effectiveDriverId = applied.driverId.trim() || undefined;
    const setDriverFilter = (driverId) => { staged.setDraft((d) => ({ ...d, driverId })); };
    searchParams.get("driver_id")
    setSearchParams
    dataTestId="cash-advance-requests-filter-driver"
    <button data-testid="cash-advance-requests-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="cash-advance-requests-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="cash-advance-requests-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — cash advance requests staged filters`);
