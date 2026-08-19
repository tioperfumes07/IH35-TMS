#!/usr/bin/env node
/**
 * verify-assignment-history-staged-filters
 * LV-DISPATCH-ASSIGNMENT-HISTORY-FILTER-NO-CANCEL —
 * Assignment History must stage filters via useStagedListFilters with Apply + Cancel + Reset.
 * Keeps assignment-history-filter-apply / assignment-history-filters for sibling guards.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-assignment-history-staged-filters";
const TARGET = "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) {
    errors.push("must use useStagedListFilters");
  }
  if (!src.includes("staged.cancel") && !/onClick=\{staged\.cancel\}/.test(src)) {
    errors.push("must wire Cancel to staged.cancel");
  }
  if (!src.includes("staged.reset") && !/onClick=\{staged\.reset\}/.test(src)) {
    errors.push("must wire Reset to staged.reset");
  }
  if (!src.includes("staged.apply") && !/onClick=\{staged\.apply\}/.test(src)) {
    errors.push("must wire Apply to staged.apply");
  }
  if (!src.includes('data-testid="assignment-history-filter-cancel"')) {
    errors.push("must expose assignment-history-filter-cancel");
  }
  if (!src.includes('data-testid="assignment-history-filter-apply"')) {
    errors.push("must keep assignment-history-filter-apply (sibling guard)");
  }
  if (!src.includes("assignment-history-filters")) {
    errors.push("must keep assignment-history-filters chrome");
  }
  if (!/queryKey:[\s\S]*applied\.driverId[\s\S]*applied\.from/.test(src)) {
    errors.push("queryKey must drive from applied.* (not draft)");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [draft, setDraft] = useState(EMPTY);
    const [applied, setApplied] = useState(EMPTY);
    <Button data-testid="assignment-history-filter-apply" onClick={() => setApplied(draft)}>Apply</Button>
    <Button data-testid="assignment-history-filter-reset" onClick={() => { setDraft(EMPTY); setApplied(EMPTY); }}>Reset</Button>
    <section data-testid="assignment-history-filters" />
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: [companyId, applied.driverId, applied.from, applied.to, applied.reason],
    <section data-testid="assignment-history-filters">
      <Button data-testid="assignment-history-filter-reset" onClick={staged.reset}>Reset</Button>
      <Button data-testid="assignment-history-filter-cancel" onClick={staged.cancel}>Cancel</Button>
      <Button data-testid="assignment-history-filter-apply" onClick={staged.apply}>Apply</Button>
    </section>
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
console.log(`${LABEL} PASS — Assignment History staged filters with Apply/Cancel/Reset`);
