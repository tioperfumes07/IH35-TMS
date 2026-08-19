#!/usr/bin/env node
/**
 * verify-safety-events-staged-filters
 * LV-SAFETY-EVENTS-FILTER-SILENT-APPLY — SafetyEventsPage list filters must
 * stage via useStagedListFilters with Apply + Cancel + Reset; query/client
 * filters use applied.*; URL subject_driver_id/subject_unit_id sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-safety-events-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="safety-events-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="safety-events-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="safety-events-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('data-testid="safety-events-filters"')) errors.push("must keep filters chrome");
  if (!/applied\.status/.test(src) || !/applied\.driverId/.test(src) || !/applied\.unitId/.test(src)) {
    errors.push("query/client must use applied.* (not draft/silent state)");
  }
  if (!/setSearchParams/.test(src) || !/subject_driver_id/.test(src) || !/subject_unit_id/.test(src)) {
    errors.push("must keep subject_driver_id/subject_unit_id URL sync");
  }
  if (/const \[statusFilter,\s*setStatusFilter\]/.test(src) || /const \[driverFilter,\s*setDriverFilter\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [statusFilter, setStatusFilter] = useState("open");
    const [driverFilter, setDriverFilter] = useState("");
    queryKey: [statusFilter, driverFilter]
    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchSearchParam(next); } });
    queryKey: [applied.status, applied.driverId, applied.unitId]
    subject_driver_id
    subject_unit_id
    setSearchParams
    <div data-testid="safety-events-filters" />
    <button data-testid="safety-events-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="safety-events-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="safety-events-filter-reset">Reset</button>
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
console.log(`${LABEL} PASS — Safety events staged filters with Apply/Cancel/Reset`);
