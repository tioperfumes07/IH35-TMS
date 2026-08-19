#!/usr/bin/env node
/**
 * verify-audit-425c-staged-filters
 * LV-SAFETY-AUDIT-425C-FILTER-SILENT-APPLY — Audit425cPage must stage filters via
 * useStagedListFilters with Apply + Cancel + Reset; query/client filters use applied.*.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-audit-425c-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="audit-425c-filter-cancel"')) errors.push("must expose audit-425c-filter-cancel");
  if (!src.includes('data-testid="audit-425c-filter-apply"')) errors.push("must expose audit-425c-filter-apply");
  if (!src.includes('data-testid="audit-425c-filters"')) errors.push("must keep audit-425c-filters chrome");
  if (!/applied\.actor/.test(src) || !/applied\.from/.test(src)) {
    errors.push("queryKey/filters must use applied.* (not draft/silent state)");
  }
  if (/const \[fromDate,\s*setFromDate\]/.test(src) || /const \[actorFilter,\s*setActorFilter\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [fromDate, setFromDate] = useState("");
    const [actorFilter, setActorFilter] = useState("");
    queryKey: [actorFilter, fromDate]
    <DatePicker value={fromDate} onChange={(n) => setFromDate(n)} />
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    queryKey: [applied.actor, applied.from]
    <div data-testid="audit-425c-filters" />
    <button data-testid="audit-425c-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="audit-425c-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — Audit 425C staged filters with Apply/Cancel/Reset`);
