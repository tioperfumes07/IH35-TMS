#!/usr/bin/env node
/**
 * verify-settlement-disputes-staged-filters
 * LV-DRIVER-FINANCE-SETTLEMENT-DISPUTES-FILTER-SILENT-APPLY — SettlementDisputesTab driver filter
 * must stage via useStagedListFilters with Apply + Cancel + Reset; query uses applied.*;
 * LST-F5182 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-settlement-disputes-staged-filters";
const TARGET = "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="settlement-disputes-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="settlement-disputes-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="settlement-disputes-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="settlement-disputes-filter-driver"')) errors.push("must keep driver picker testid");
  if (!/applied\.driverId/.test(src) && !/effectiveDriverId/.test(src)) {
    errors.push("query must use applied/effectiveDriverId (not silent state)");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src)) {
    errors.push("must keep LST-F5182 driver_id URL sync");
  }
  if (/const \[driverId,\s*setDriverIdState\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [driverId, setDriverIdState] = useState("");
    function setDriverId(next) { setDriverIdState(next); setSearchParams(...); }
    queryKey: [driverId]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const effectiveDriverId = applied.driverId.trim();
    searchParams.get("driver_id")
    setSearchParams
    dataTestId="settlement-disputes-filter-driver"
    <button data-testid="settlement-disputes-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="settlement-disputes-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="settlement-disputes-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — settlement disputes staged filters`);
