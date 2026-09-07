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
  // NEW-20 (2026-09-07): the Recourse Pipeline filter chrome moved onto the shared
  // CollapsedListFilters component (ParityTable's filterBar slot, same pattern the Accounting
  // module already standardizes on) — it wires Apply/Cancel via onApply={staged.apply} /
  // onCancel={staged.cancel} props, not a raw <button onClick={staged.apply}>. Either wiring
  // shape satisfies the real intent (Apply IS staged.apply, Cancel IS staged.cancel); accept both
  // so a page is free to use either the raw button or the shared collapsed-filters chrome.
  if (!/onClick=\{staged\.apply\}/.test(src) && !/onApply=\{staged\.apply\}/.test(src)) {
    errors.push("must wire Apply to staged.apply");
  }
  if (!/onClick=\{staged\.cancel\}/.test(src) && !/onCancel=\{staged\.cancel\}/.test(src)) {
    errors.push("must wire Cancel to staged.cancel");
  }
  // Same either-shape acceptance for the testids: a literal data-testid="..." (raw button) or
  // the CollapsedListFilters testid-prop passthrough (cancelTestId="..."/applyTestId="..."/
  // resetTestId="...", rendered as the real data-testid attribute at runtime by that component).
  if (!src.includes('data-testid="factoring-home-filter-cancel"') && !src.includes('cancelTestId="factoring-home-filter-cancel"')) {
    errors.push("must expose filter-cancel");
  }
  if (!src.includes('data-testid="factoring-home-filter-apply"') && !src.includes('applyTestId="factoring-home-filter-apply"')) {
    errors.push("must expose filter-apply");
  }
  if (!src.includes('data-testid="factoring-home-filter-reset"') && !src.includes('resetTestId="factoring-home-filter-reset"')) {
    errors.push("must expose filter-reset");
  }
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
  // NEW-20 shape: CollapsedListFilters prop wiring instead of raw buttons.
  const goodCollapsed = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchListSearchParam(next); } });
    filterDraft.customerId
    filterDraft.loadId
    deepLinkCustomerId
    deepLinkLoadId
    searchParams.get("customer_id")
    setSearchParams
    patchListSearchParam
    <CollapsedListFilters
      onApply={staged.apply}
      onCancel={staged.cancel}
      applyTestId="factoring-home-filter-apply"
      cancelTestId="factoring-home-filter-cancel"
      resetTestId="factoring-home-filter-reset"
    />
  `;
  if (
    assertPage(bad).length === 0 ||
    assertPage(good).length > 0 ||
    assertPage(goodCollapsed).length > 0
  ) {
    console.error(`${LABEL} SELFTEST FAIL`, {
      bad: assertPage(bad),
      good: assertPage(good),
      goodCollapsed: assertPage(goodCollapsed),
    });
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
