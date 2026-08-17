#!/usr/bin/env node
/**
 * verify-finance-readonly-staged-filters
 * CLS-FINANCE-READONLY-FILTER-APPLY-CANCEL-RESET — Statements + AR/AP Aging must
 * stage date/basis filters in CollapsedListFilters with Apply/Cancel/Reset (no
 * Apply-only chrome; Basis must not commit immediately outside the draft).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-finance-readonly-staged-filters";
const STATEMENTS = "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx";
const AGING = "apps/frontend/src/pages/finance/ArApAgingPage.tsx";

function assertStatements(src) {
  const errors = [];
  if (!src.includes("CollapsedListFilters") || !src.includes("useStagedListFilters")) {
    errors.push(`${STATEMENTS}: must use CollapsedListFilters + useStagedListFilters`);
  }
  if (!/staged\.draft\.basis/.test(src)) {
    errors.push(`${STATEMENTS}: Basis must bind staged.draft.basis (not immediate setBasis)`);
  }
  if (/setBasis\(/.test(src) && !/staged\.setDraft/.test(src)) {
    errors.push(`${STATEMENTS}: must not keep immediate setBasis outside staged draft`);
  }
  if (/setAppliedAsOf\(asOf\)|setApplied\(\{ \.\.\.period \}\)/.test(src)) {
    errors.push(`${STATEMENTS}: must not keep Apply-only setApplied / setAppliedAsOf chrome`);
  }
  if (!/onCancel=\{staged\.cancel\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src)) {
    errors.push(`${STATEMENTS}: must wire Cancel + Reset`);
  }
  return errors;
}

function assertAging(src) {
  const errors = [];
  if (!src.includes("CollapsedListFilters") || !src.includes("useStagedListFilters")) {
    errors.push(`${AGING}: must use CollapsedListFilters + useStagedListFilters`);
  }
  if (!/staged\.draft\.asOfDate/.test(src)) {
    errors.push(`${AGING}: As-of must bind staged.draft.asOfDate`);
  }
  if (/setAppliedAsOf\(asOfDate\)/.test(src)) {
    errors.push(`${AGING}: must not keep Apply-only setAppliedAsOf(asOfDate)`);
  }
  if (!/onCancel=\{staged\.cancel\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src)) {
    errors.push(`${AGING}: must wire Cancel + Reset`);
  }
  return errors;
}

function selftest() {
  const badS = `const [basis, setBasis] = useState("accrual");
    <BasisSelector value={basis} onChange={setBasis} />
    <Button onClick={() => setApplied({ ...period })}>Apply</Button>`;
  const goodS = `useStagedListFilters({...});
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
      <BasisSelector value={staged.draft.basis} onChange={(n) => staged.setDraft({...staged.draft, basis: n})} />
    </CollapsedListFilters>`;
  const badA = `<button onClick={() => setAppliedAsOf(asOfDate)}>Apply</button>`;
  const goodA = `useStagedListFilters;
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
      <DatePicker value={staged.draft.asOfDate} />
    </CollapsedListFilters>`;
  if (assertStatements(badS).length === 0 || assertStatements(goodS).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL statements`);
    process.exit(1);
  }
  if (assertAging(badA).length === 0 || assertAging(goodA).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL aging`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [
  ...assertStatements(fs.readFileSync(path.join(process.cwd(), STATEMENTS), "utf8")),
  ...assertAging(fs.readFileSync(path.join(process.cwd(), AGING), "utf8")),
];
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Statements + AR/AP Aging staged Filters`);
