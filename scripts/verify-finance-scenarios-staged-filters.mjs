#!/usr/bin/env node
/**
 * verify-finance-scenarios-staged-filters
 * LV-FINANCE-SCENARIOS-FILTER-APPLY-MISSING — Finance Scenarios list must expose
 * CollapsedListFilters for status + period_basis with Apply/Cancel/Reset.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-finance-scenarios-staged-filters";
const TARGET = "apps/frontend/src/pages/finance/FinanceScenariosPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("CollapsedListFilters") || !src.includes("useStagedListFilters")) {
    errors.push("must use CollapsedListFilters + useStagedListFilters");
  }
  if (!/onCancel=\{staged\.cancel\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src)) {
    errors.push("must wire Cancel + Reset");
  }
  if (!/staged\.draft\.status/.test(src) || !/staged\.draft\.periodBasis/.test(src)) {
    errors.push("must stage status + periodBasis drafts");
  }
  if (!/appliedFilter\.status/.test(src) || !/appliedFilter\.periodBasis/.test(src)) {
    errors.push("must filter rows from appliedFilter (not draft-only)");
  }
  return errors;
}

function selftest() {
  const bad = `<ParityTable rows={scenarios} />`;
  const good = `
    useStagedListFilters({ applied: appliedFilter, empty, onApply: setAppliedFilter });
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
      <select value={staged.draft.status} />
      <select value={staged.draft.periodBasis} />
    </CollapsedListFilters>
    rows.filter(s => appliedFilter.status === "all" || s.status === appliedFilter.status)
         .filter(s => appliedFilter.periodBasis === "all" || s.period_basis === appliedFilter.periodBasis)
  `;
  if (assertPage(bad).length === 0 || assertPage(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, assertPage(good));
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
console.log(`${LABEL} PASS — Finance Scenarios staged status + period_basis Filters`);
