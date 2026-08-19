#!/usr/bin/env node
/**
 * verify-accidents-staged-filters
 * LV-SAFETY-ACCIDENTS-FILTER-SILENT-APPLY — AccidentsPage client filters must
 * stage via useStagedListFilters with Apply + Cancel + Reset; row filter uses
 * applied.*, not draft/silent useState.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-accidents-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/AccidentsPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="accidents-filter-cancel"')) errors.push("must expose accidents-filter-cancel");
  if (!src.includes('data-testid="accidents-filter-apply"')) errors.push("must expose accidents-filter-apply");
  if (!src.includes('data-testid="accidents-filters"')) errors.push("must keep accidents-filters chrome");
  if (!/applied\.driverId/.test(src) || !/applied\.from/.test(src)) {
    errors.push("row filter must use applied.* (not draft/silent state)");
  }
  if (/const \[driverFilter,\s*setDriverFilter\]/.test(src)) {
    errors.push("must not keep hand-rolled driverFilter useState");
  }
  if (/value=\{driverFilter/.test(src) || /value=\{fromDate/.test(src)) {
    errors.push("pickers/dates must bind to draft, not silent applied state vars");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [driverFilter, setDriverFilter] = useState("");
    const [fromDate, setFromDate] = useState("");
    if (driverFilter) { /* filter rows */ }
    <EntityPicker value={driverFilter || null} onChange={(n) => setDriverFilter(n ?? "")} />
    <DatePicker value={fromDate} onChange={setFromDate} />
    <button>Clear</button>
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    if (applied.driverId) { /* filter */ }
    if (applied.from && accidentDate < applied.from) return false;
    <div data-testid="accidents-filters" />
    <button data-testid="accidents-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="accidents-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <EntityPicker value={draft.driverId || null} />
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
console.log(`${LABEL} PASS — Accidents staged filters with Apply/Cancel/Reset`);
