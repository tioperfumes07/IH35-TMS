#!/usr/bin/env node
/**
 * verify-external-fines-staged-filters
 * LV-SAFETY-EXTERNAL-FINES-FILTER-SILENT-APPLY — FinesPage must stage status/subject/driver/unit
 * via useStagedListFilters with Apply + Cancel + Reset; query uses applied.*.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-external-fines-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/FinesPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="external-fines-filter-cancel"')) {
    errors.push("must expose external-fines-filter-cancel");
  }
  if (!src.includes('data-testid="external-fines-filter-apply"')) {
    errors.push("must expose external-fines-filter-apply");
  }
  if (!src.includes('data-testid="external-fines-filters"')) {
    errors.push("must keep external-fines-filters chrome");
  }
  if (!/applied\.status/.test(src) || !/applied\.driverId/.test(src) || !/applied\.unitId/.test(src)) {
    errors.push("query must use applied.* (not silent draft)");
  }
  if (!/fines-filter-driver/.test(src) || !/fines-filter-unit/.test(src) || !/subject_driver_id/.test(src)) {
    errors.push("must keep LST-F5163F EntityPickers + subject_driver_id query args");
  }
  if (/const \[statusFilter,\s*setStatusFilter\]/.test(src) || /const \[driverFilter,\s*setDriverFilter\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [statusFilter, setStatusFilter] = useState("");
    const [driverFilter, setDriverFilter] = useState("");
    queryKey: [statusFilter, driverFilter]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: [applied.status, applied.driverId, applied.unitId]
    subject_driver_id: applied.driverId
    dataTestId="fines-filter-driver"
    dataTestId="fines-filter-unit"
    <div data-testid="external-fines-filters" />
    <button data-testid="external-fines-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="external-fines-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — External Fines staged filters with Apply/Cancel/Reset`);
