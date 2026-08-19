#!/usr/bin/env node
/**
 * verify-factoring-home-staged-filters
 * LV-FACTORING-HOME-FILTER-SILENT-APPLY — FactoringHome reverse filters must
 * stage via useStagedListFilters with Apply + Cancel + Reset; queries use applied
 * (deepLink* aliases); LST-F5193 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-factoring-home-staged-filters";
const TARGET = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="factoring-home-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="factoring-home-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="factoring-home-filter-reset"')) errors.push("must expose filter-reset");
  if (!/filterDraft\.customerId/.test(src) || !/filterDraft\.loadId/.test(src)) {
    errors.push("pickers must bind filterDraft.*");
  }
  if (!/deepLinkCustomerId/.test(src) || !/deepLinkLoadId/.test(src)) {
    errors.push("must keep deepLink* aliases for sibling reverse guards");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("customer_id"\)/.test(src) || !/patchListSearchParam/.test(src)) {
    errors.push("must keep LST-F5193 URL sync");
  }
  if (/patchSearchParam\("customer_id"/.test(src) || /patchSearchParam\("driver_id"/.test(src)) {
    errors.push("must not silently patch URL on every picker change");
  }
  return errors;
}

function selftest() {
  const bad = `
    function patchSearchParam(key, next) { setSearchParams(p); }
    const deepLinkCustomerId = searchParams.get("customer_id");
    <EntityPicker onChange={(next) => patchSearchParam("customer_id", next ?? "")} />
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchListSearchParam(next); } });
    filterDraft.customerId
    filterDraft.loadId
    deepLinkCustomerId
    deepLinkLoadId
    searchParams.get("customer_id")
    setSearchParams
    patchListSearchParam
    <button data-testid="factoring-home-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="factoring-home-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="factoring-home-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — FactoringHome staged filters with Apply/Cancel/Reset`);
