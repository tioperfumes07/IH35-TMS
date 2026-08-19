#!/usr/bin/env node
/**
 * verify-fleet-hos-board-staged-filters
 * LV-FLEET-HOS-BOARD-FILTER-SILENT-APPLY — FleetHosBoardSection unit filter must stage via
 * useStagedListFilters with Apply + Cancel + Reset; partition filter uses applied/effectiveUnitId;
 * keep requestedUnitId = searchParams.get("unit_id") + LST-F5173 reverse chrome.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-fleet-hos-board-staged-filters";
const TARGET = "apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="fleet-hos-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="fleet-hos-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="fleet-hos-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="fleet-hos-filter-unit"')) errors.push("must keep unit picker testid");
  if (!/allowCreate=\{false\}/.test(src)) errors.push("must keep allowCreate={false}");
  if (!/requestedUnitId\s*=\s*searchParams\.get\("unit_id"\)/.test(src)) {
    errors.push('must keep requestedUnitId = searchParams.get("unit_id")');
  }
  if (!/row\.unit_id === effectiveUnitId/.test(src) || !/applied\.unitId/.test(src)) {
    errors.push("must keep effectiveUnitId partition filter from applied");
  }
  if (!/setSearchParams/.test(src) || !/setUnitFilter/.test(src)) {
    errors.push("must keep setUnitFilter + setSearchParams URL sync");
  }
  if (/const \[unitPickerId,\s*setUnitPickerId\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const requestedUnitId = searchParams.get("unit_id");
    const [unitPickerId, setUnitPickerId] = useState("");
    const setUnitFilter = (unitId) => { setUnitPickerId(unitId); setSearchParams(...); };
    row.unit_id === effectiveUnitId
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const requestedUnitId = searchParams.get("unit_id");
    const effectiveUnitId = applied.unitId.trim() || undefined;
    row.unit_id === effectiveUnitId
    const setUnitFilter = (unitId) => { staged.setDraft((d) => ({ ...d, unitId })); };
    setSearchParams
    allowCreate={false}
    dataTestId="fleet-hos-filter-unit"
    <button data-testid="fleet-hos-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="fleet-hos-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="fleet-hos-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — fleet hos board staged filters`);
