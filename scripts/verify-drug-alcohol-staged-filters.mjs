#!/usr/bin/env node
/**
 * verify-drug-alcohol-staged-filters
 * LV-SAFETY-DRUG-ALCOHOL-FILTER-SILENT-APPLY — DrugAlcoholTab history type/result/from/to
 * must stage via useStagedListFilters with Apply + Cancel + Reset; list uses appliedHistory.*.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-drug-alcohol-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{stagedHistory\.apply\}/.test(src)) errors.push("must wire Apply to stagedHistory.apply");
  if (!/onClick=\{stagedHistory\.cancel\}/.test(src)) errors.push("must wire Cancel to stagedHistory.cancel");
  if (!src.includes('data-testid="drug-alcohol-history-filter-cancel"')) {
    errors.push("must expose drug-alcohol-history-filter-cancel");
  }
  if (!src.includes('data-testid="drug-alcohol-history-filter-apply"')) {
    errors.push("must expose drug-alcohol-history-filter-apply");
  }
  if (!src.includes('data-testid="drug-alcohol-history-filters"')) {
    errors.push("must keep drug-alcohol-history-filters chrome");
  }
  if (
    !/appliedHistory\.type/.test(src) ||
    !/appliedHistory\.result/.test(src) ||
    !/appliedHistory\.from/.test(src) ||
    !/appliedHistory\.to/.test(src)
  ) {
    errors.push("history list must use appliedHistory.* (not silent draft)");
  }
  if (!/drug-alcohol-filter-driver/.test(src) || !/setDriverId/.test(src) || !/setSearchParams/.test(src)) {
    errors.push("must keep LST-F5183 driver EntityPicker + setDriverId + URL sync");
  }
  if (/const \[filterType,\s*setFilterType\]/.test(src)) {
    errors.push("must not keep hand-rolled silent history filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [filterType, setFilterType] = useState("");
    if (filterType && String(row.test_type) !== filterType) return false;
  `;
  const good = `
    useStagedListFilters({ applied: appliedHistory, empty: EMPTY_HISTORY_FILTERS, onApply: setAppliedHistory });
    if (appliedHistory.type && String(row.test_type) !== appliedHistory.type) return false;
    if (appliedHistory.result && String(row.result) !== appliedHistory.result) return false;
    if (appliedHistory.from && (!testDateStr || testDateStr < appliedHistory.from)) return false;
    if (appliedHistory.to && (!testDateStr || testDateStr > appliedHistory.to)) return false;
    function setDriverId(next) { setDriverIdState(next); setSearchParams(p); }
    dataTestId="drug-alcohol-filter-driver"
    <div data-testid="drug-alcohol-history-filters" />
    <button data-testid="drug-alcohol-history-filter-apply" onClick={stagedHistory.apply}>Apply</button>
    <button data-testid="drug-alcohol-history-filter-cancel" onClick={stagedHistory.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — DrugAlcohol history staged filters with Apply/Cancel/Reset`);
