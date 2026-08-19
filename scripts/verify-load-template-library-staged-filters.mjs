#!/usr/bin/env node
/**
 * verify-load-template-library-staged-filters
 * LV-LOAD-TEMPLATE-LIBRARY-FILTER-SILENT-APPLY — LoadTemplateLibrary customer filter must stage via
 * useStagedListFilters with Apply + Cancel + Reset; query uses applied/effectiveCustomerId;
 * keep deepLinkCustomerId + setCustomerFilter + LST-F5174 testids.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-load-template-library-staged-filters";
const TARGET = "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="load-template-library-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="load-template-library-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="load-template-library-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="load-template-library-filter-customer"')) errors.push("must keep customer picker testid");
  if (!/allowCreate=\{false\}/.test(src)) errors.push("must keep allowCreate={false}");
  if (!/deepLinkCustomerId\s*=\s*searchParams\.get\("customer_id"\)/.test(src)) {
    errors.push('must keep deepLinkCustomerId = searchParams.get("customer_id")');
  }
  if (!/customer_id:\s*effectiveCustomerId/.test(src) || !/applied\.customerId/.test(src)) {
    errors.push("query must use applied/effectiveCustomerId");
  }
  if (!/setSearchParams/.test(src) || !/setCustomerFilter/.test(src)) {
    errors.push("must keep setCustomerFilter + setSearchParams URL sync");
  }
  if (/const \[customerPickerId,\s*setCustomerPickerId\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const deepLinkCustomerId = searchParams.get("customer_id");
    const [customerPickerId, setCustomerPickerId] = useState("");
    const setCustomerFilter = (customerId) => { setCustomerPickerId(customerId); setSearchParams(...); };
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const deepLinkCustomerId = searchParams.get("customer_id") ?? undefined;
    const effectiveCustomerId = applied.customerId.trim() || undefined;
    customer_id: effectiveCustomerId
    const setCustomerFilter = (customerId) => { staged.setDraft((d) => ({ ...d, customerId })); };
    setSearchParams
    allowCreate={false}
    dataTestId="load-template-library-filter-customer"
    <button data-testid="load-template-library-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="load-template-library-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="load-template-library-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — load template library staged filters`);
