#!/usr/bin/env node
/**
 * verify-factoring-submission-queue-staged-filters
 * LV-FACTORING-SUBMISSION-QUEUE-FILTER-SILENT-APPLY — SubmissionQueue customer/load filters
 * must stage via useStagedListFilters with Apply + Cancel + Reset; query uses applied.*;
 * LST-F5196 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-factoring-submission-queue-staged-filters";
const TARGET = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="factoring-submit-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="factoring-submit-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="factoring-submit-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('data-testid="factoring-submit-filters"')) errors.push("must keep filters chrome");
  if (!/applied\.customerId/.test(src) || !/applied\.loadId/.test(src)) {
    errors.push("query must use applied.* (not silent state)");
  }
  if (!/setSearchParams/.test(src) || !/setCustomerFilter/.test(src) || !/searchParams\.get\("customer_id"\)/.test(src)) {
    errors.push("must keep LST-F5196 setCustomerFilter + setSearchParams URL sync");
  }
  if (/const \[customerFilter,\s*setCustomerFilterState\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [customerFilter, setCustomerFilterState] = useState("");
    function setCustomerFilter(next) { setCustomerFilterState(next); patchSearchParam("customer_id", next); }
    queryKey: [customerFilter]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchListSearchParam(next); } });
    queryKey: [applied.customerId, applied.loadId]
    setCustomerFilter
    setSearchParams
    searchParams.get("customer_id")
    <div data-testid="factoring-submit-filters" />
    <button data-testid="factoring-submit-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="factoring-submit-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="factoring-submit-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — submission queue staged filters`);
