#!/usr/bin/env node
/**
 * verify-integrity-alerts-staged-filters
 * LV-SAFETY-INTEGRITY-ALERTS-FILTER-SILENT-APPLY — IntegrityAlertsPage must stage
 * category/severity/status/driver/unit/vendor via useStagedListFilters with Apply + Cancel + Reset;
 * query uses applied.*.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-integrity-alerts-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/IntegrityAlertsPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="integrity-alerts-filter-cancel"')) {
    errors.push("must expose integrity-alerts-filter-cancel");
  }
  if (!src.includes('data-testid="integrity-alerts-filter-apply"')) {
    errors.push("must expose integrity-alerts-filter-apply");
  }
  if (!src.includes('data-testid="integrity-alerts-filters"')) {
    errors.push("must keep integrity-alerts-filters chrome");
  }
  if (
    !/applied\.category/.test(src) ||
    !/applied\.driverId/.test(src) ||
    !/applied\.unitId/.test(src) ||
    !/applied\.vendorId/.test(src)
  ) {
    errors.push("query must use applied.* (not silent draft)");
  }
  if (
    !/integrity-alerts-filter-driver/.test(src) ||
    !/integrity-alerts-filter-unit/.test(src) ||
    !/integrity-alerts-filter-vendor/.test(src) ||
    !/subject_driver_id/.test(src)
  ) {
    errors.push("must keep LST-F5163H EntityPickers + subject_* query args");
  }
  if (!/function\s+setDriverFilter/.test(src)) {
    errors.push("must keep setDriverFilter name for sibling reverse guard");
  }
  if (/const \[driverFilter,\s*setDriverFilter\]/.test(src) || /const \[category,\s*setCategory\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [category, setCategory] = useState("");
    const [driverFilter, setDriverFilter] = useState("");
    queryKey: [category, driverFilter]
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    function setDriverFilter(next) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    queryKey: [applied.category, applied.driverId, applied.unitId, applied.vendorId]
    subject_driver_id: applied.driverId
    dataTestId="integrity-alerts-filter-driver"
    dataTestId="integrity-alerts-filter-unit"
    dataTestId="integrity-alerts-filter-vendor"
    <div data-testid="integrity-alerts-filters" />
    <button data-testid="integrity-alerts-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="integrity-alerts-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — Integrity Alerts staged filters with Apply/Cancel/Reset`);
