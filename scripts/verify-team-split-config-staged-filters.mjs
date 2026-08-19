#!/usr/bin/env node
/**
 * verify-team-split-config-staged-filters
 * LV-DRIVERS-TEAM-SPLIT-FILTER-SILENT-APPLY — TeamSplitConfig driver filter must stage via
 * useStagedListFilters with Apply + Cancel + Reset; list filter uses applied driverId;
 * LST-F5185 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-team-split-config-staged-filters";
const TARGET = "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="team-split-config-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="team-split-config-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="team-split-config-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="team-split-config-filter-driver"')) errors.push("must keep driver picker testid");
  if (!/row\.primary_driver_id === driverId \|\| row\.secondary_driver_id === driverId/.test(src)) {
    errors.push("must keep reverse-section active-list driverId predicate");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src) || !/setDriverId/.test(src)) {
    errors.push("must keep LST-F5185 setDriverId + setSearchParams URL sync");
  }
  if (/function setDriverId\(next: string\) \{\s*const p = new URLSearchParams/.test(src)) {
    errors.push("must not silent-apply URL inside setDriverId");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setDriverId(next: string) {
      const p = new URLSearchParams(searchParams);
      setSearchParams(p, { replace: true });
    }
    const driverId = searchParams.get("driver_id")
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const driverId = applied.driverId.trim();
    row.primary_driver_id === driverId || row.secondary_driver_id === driverId
    function setDriverId(next: string) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    searchParams.get("driver_id")
    setSearchParams
    dataTestId="team-split-config-filter-driver"
    <button data-testid="team-split-config-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="team-split-config-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="team-split-config-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — team split config staged filters`);
