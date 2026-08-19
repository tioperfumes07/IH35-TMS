#!/usr/bin/env node
/**
 * verify-cargo-claims-staged-filters
 * LV-SAFETY-CARGO-CLAIMS-FILTER-SILENT-APPLY — CargoClaimIntakeSurface list filters must
 * stage via useStagedListFilters with Apply + Cancel + Reset; query uses applied.*;
 * LST-F5194 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-cargo-claims-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes("-filter-cancel")) errors.push("must expose filter-cancel");
  if (!src.includes("-filter-apply")) errors.push("must expose filter-apply");
  if (!src.includes("-filter-reset")) errors.push("must expose filter-reset");
  if (!src.includes("-filters")) errors.push("must keep filters chrome");
  if (!/applied\.driverId/.test(src) || !/applied\.loadId/.test(src) || !/applied\.unitId/.test(src)) {
    errors.push("query must use applied.* (not draft/silent state)");
  }
  if (!/setSearchParams/.test(src) || !/driver_id/.test(src) || !/patchListSearchParam/.test(src)) {
    errors.push("must keep LST-F5194 URL sync via patchListSearchParam");
  }
  if (/const \[driverFilter,\s*setDriverFilterState\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [driverFilter, setDriverFilterState] = useState("");
    function setDriverFilter(next) { setDriverFilterState(next); patchSearchParam("driver_id", next); }
    queryKey: [driverFilter]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchListSearchParam(next); } });
    queryKey: [applied.driverId, applied.loadId, applied.unitId]
    driver_id
    setSearchParams
    patchListSearchParam
    <div data-testid="cargo-claims-filters" />
    <button data-testid="cargo-claims-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="cargo-claims-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="cargo-claims-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — Cargo claims staged filters with Apply/Cancel/Reset`);
