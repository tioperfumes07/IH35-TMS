#!/usr/bin/env node
/**
 * verify-cash-advances-home-staged-filters
 * LV-CASH-ADVANCES-HOME-FILTER-SILENT-APPLY — CashAdvancesHomePage driver filter must stage via
 * useStagedListFilters with Apply + Cancel + Reset; list query uses applied/effectiveDriverId;
 * BANK-F5164 URL sync on Apply (keep driverIdFilter = searchParams.get("driver_id")).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-cash-advances-home-staged-filters";
const TARGET = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="cash-advances-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="cash-advances-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="cash-advances-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="cash-advances-filter-driver"')) errors.push("must keep driver picker testid");
  if (!/driverIdFilter\s*=\s*searchParams\.get\("driver_id"\)/.test(src)) {
    errors.push("must keep driverIdFilter = searchParams.get(\"driver_id\") for reverse sibling");
  }
  if (!/effectiveDriverId/.test(src) || !/applied\.driverId/.test(src)) {
    errors.push("query must use applied/effectiveDriverId");
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
    const [driverPickerId, setDriverPickerId] = useState("");
    const setDriverFilter = (driverId) => { setDriverPickerId(driverId); setSearchParams(...); };
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const driverIdFilter = searchParams.get("driver_id")?.trim() ?? "";
    const effectiveDriverId = applied.driverId.trim() || undefined;
    const setDriverFilter = (driverId) => { staged.setDraft((d) => ({ ...d, driverId })); };
    setSearchParams
    dataTestId="cash-advances-filter-driver"
    <button data-testid="cash-advances-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="cash-advances-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="cash-advances-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — cash advances home staged filters`);
