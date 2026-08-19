#!/usr/bin/env node
/**
 * verify-complaints-staged-filters
 * LV-SAFETY-COMPLAINTS-FILTER-SILENT-APPLY — ComplaintsTab must stage driver filter via
 * useStagedListFilters with Apply + Cancel + Reset; query uses applied.*; URL on Apply (LST-F5191).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-complaints-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="complaints-filter-cancel"')) errors.push("must expose complaints-filter-cancel");
  if (!src.includes('data-testid="complaints-filter-apply"')) errors.push("must expose complaints-filter-apply");
  if (!src.includes('data-testid="complaints-filters"')) errors.push("must keep complaints-filters chrome");
  if (!/applied\.driverId/.test(src)) errors.push("query must use applied.driverId (not silent draft)");
  if (/setDriverFilterState\(next\)[\s\S]*setSearchParams/.test(src) && !/useStagedListFilters/.test(src)) {
    errors.push("must not keep silent setDriverFilter → URL path");
  }
  if (!/setSearchParams/.test(src) || !/complaints-filter-driver/.test(src) || !/setDriverFilter/.test(src)) {
    errors.push("must keep LST-F5191 URL sync + complaints-filter-driver + setDriverFilter name");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setDriverFilter(next) { setDriverFilterState(next); setSearchParams(p); }
    queryKey: [driverFilter]
    value={driverFilter || null}
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: [applied.driverId]
    function setDriverFilter(next) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    setSearchParams(p, { replace: true });
    dataTestId="complaints-filter-driver"
    <div data-testid="complaints-filters" />
    <button data-testid="complaints-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="complaints-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — Complaints staged filters with Apply/Cancel/Reset`);
