#!/usr/bin/env node
/**
 * verify-cancellations-report-staged-filters
 * LV-REPORTS-CANCELLATIONS-FILTER-SILENT-APPLY / CLS-REPORTS-FILTER-APPLY-CANCEL-RESET —
 * Cancellations report From/To must stage via CollapsedListFilters + Apply/Cancel/Reset;
 * the query must key off applied dates, not draft-only silent apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-cancellations-report-staged-filters";
const TARGET = "apps/frontend/src/pages/reports/CancellationsReportPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("CollapsedListFilters") || !src.includes("useStagedListFilters")) {
    errors.push("must use CollapsedListFilters + useStagedListFilters");
  }
  if (!/onCancel=\{staged\.cancel\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src)) {
    errors.push("must wire Cancel + Reset");
  }
  if (!/onApply=\{staged\.apply\}/.test(src)) {
    errors.push("must wire Apply via staged.apply");
  }
  if (!/staged\.draft\.from/.test(src) || !/staged\.draft\.to/.test(src)) {
    errors.push("must bind DatePickers to staged.draft.from/to");
  }
  if (!/queryKey:[\s\S]*applied\.from[\s\S]*applied\.to/.test(src)) {
    errors.push("queryKey must use applied.from/to (not draft)");
  }
  if (/onClick=\{\(\)\s*=>\s*setApplied\(\{\s*from:\s*from/.test(src)) {
    errors.push("must not use ad-hoc Apply button that bypasses CollapsedListFilters");
  }
  if (!src.includes('testIdPrefix="reports-cancellations"')) {
    errors.push('must set testIdPrefix="reports-cancellations"');
  }
  return errors;
}

function selftest() {
  const bad = `
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [applied, setApplied] = useState({});
    <DatePicker value={from} onChange={setFrom} />
    <Button onClick={() => setApplied({ from: from || undefined, to: to || undefined })}>Apply</Button>
  `;
  const good = `
    useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} testIdPrefix="reports-cancellations">
      <DatePicker value={staged.draft.from} />
      <DatePicker value={staged.draft.to} />
    </CollapsedListFilters>
    queryKey: ["reports", "cancellations", companyId, applied.from, applied.to],
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
console.log(`${LABEL} PASS — Cancellations report staged From/To Filters with Apply/Cancel/Reset`);
