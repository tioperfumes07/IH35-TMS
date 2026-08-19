#!/usr/bin/env node
/**
 * verify-pending-settlement-deductions-staged-filters
 * LV-DRIVERS-PENDING-DEDUCTIONS-FILTER-SILENT-APPLY — PendingSettlementDeductionsPanel
 * must stage driver filter via useStagedListFilters with Apply + Cancel + Reset;
 * query uses applied.*; LST-F5187 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-pending-settlement-deductions-staged-filters";
const TARGET = "apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="settlement-deductions-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="settlement-deductions-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="settlement-deductions-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('data-testid="settlement-deductions-filters"')) errors.push("must keep filters chrome");
  if (!/applied\.driverId/.test(src)) errors.push("query must use applied.driverId");
  if (!/setSearchParams/.test(src) || !/setDriverFilter/.test(src) || !/driver_id/.test(src)) {
    errors.push("must keep LST-F5187 setDriverFilter + setSearchParams URL sync");
  }
  if (/const \[driverFilter,\s*setDriverFilterState\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [driverFilter, setDriverFilterState] = useState("");
    function setDriverFilter(next) { setDriverFilterState(next); setSearchParams(p); }
    queryKey: [driverFilter]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchSearchParam(next); } });
    queryKey: [applied.driverId]
    setDriverFilter
    setSearchParams
    driver_id
    <div data-testid="settlement-deductions-filters" />
    <button data-testid="settlement-deductions-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="settlement-deductions-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="settlement-deductions-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — pending settlement deductions staged filters`);
