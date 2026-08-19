#!/usr/bin/env node
/**
 * verify-intransit-issues-staged-filters
 * LV-DISPATCH-INTRANSIT-ISSUES-FILTER-SILENT-APPLY — InTransitIssuesPage list filters must
 * stage via useStagedListFilters with Apply + Cancel + Reset; query uses applied.*;
 * LST-F5186 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-intransit-issues-staged-filters";
const TARGET = "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="intransit-issues-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="intransit-issues-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="intransit-issues-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('data-testid="intransit-issues-filters"')) errors.push("must keep filters chrome");
  if (!/applied\.driverId/.test(src) || !/applied\.loadId/.test(src) || !/applied\.unitId/.test(src)) {
    errors.push("query must use applied.* (not silent URL-only state)");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src) || !/patchListSearchParam/.test(src)) {
    errors.push("must keep LST-F5186 URL sync");
  }
  if (/patchSearchParam\("driver_id"/.test(src)) {
    errors.push("must not silently patch URL on every picker change");
  }
  return errors;
}

function selftest() {
  const bad = `
    function patchSearchParam(key, next) { setSearchParams(p); }
    queryKey: [reverseDriverId]
    <EntityPicker onChange={(next) => patchSearchParam("driver_id", next ?? "")} />
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchListSearchParam(next); } });
    queryKey: [applied.driverId, applied.loadId, applied.unitId]
    searchParams.get("driver_id")
    setSearchParams
    patchListSearchParam
    <div data-testid="intransit-issues-filters" />
    <button data-testid="intransit-issues-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="intransit-issues-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="intransit-issues-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — in-transit issues staged filters with Apply/Cancel/Reset`);
