#!/usr/bin/env node
/**
 * verify-auto-deduction-policies-staged-filters
 * LV-DRIVERS-AUTO-DEDUCTION-FILTER-SILENT-APPLY — AutoDeductionPoliciesPanel driver filter
 * must stage via useStagedListFilters with Apply + Cancel + Reset; list scoped to applied.*;
 * LST-F5184 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-auto-deduction-policies-staged-filters";
const TARGET = "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="auto-deduction-policies-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="auto-deduction-policies-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="auto-deduction-policies-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="auto-deduction-policies-filter-driver"')) errors.push("must keep driver picker testid");
  if (!/effectiveDriverId/.test(src) || !/applied\.driverId/.test(src)) {
    errors.push("list must use applied/effectiveDriverId (not silent URL-only)");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src) || !/setDriverFilter/.test(src)) {
    errors.push("must keep LST-F5184 setDriverFilter + setSearchParams URL sync");
  }
  if (/function setDriverFilter\(next: string\) \{\s*const p = new URLSearchParams/.test(src)) {
    errors.push("must not silent-apply URL inside setDriverFilter");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setDriverFilter(next: string) {
      const p = new URLSearchParams(searchParams);
      setSearchParams(p, { replace: true });
    }
    value={deepLinkDriverId}
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const effectiveDriverId = applied.driverId.trim() || undefined;
    function setDriverFilter(next: string) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    searchParams.get("driver_id")
    setSearchParams
    dataTestId="auto-deduction-policies-filter-driver"
    <button data-testid="auto-deduction-policies-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="auto-deduction-policies-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="auto-deduction-policies-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — auto deduction policies staged filters`);
