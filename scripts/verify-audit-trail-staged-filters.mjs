#!/usr/bin/env node
/**
 * verify-audit-trail-staged-filters
 * LV-AUDIT-TRAIL-FILTER-NO-CANCEL — Audit Trail must stage filters via useStagedListFilters
 * with Apply + Cancel + Reset; query keys appliedFilters (not draft).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-audit-trail-staged-filters";
const TARGET = "apps/frontend/src/pages/audit/AuditTrailPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="audit-trail-filter-cancel"')) errors.push("must expose audit-trail-filter-cancel");
  if (!src.includes('data-testid="audit-trail-filter-apply"')) errors.push("must expose audit-trail-filter-apply");
  if (!src.includes("audit-trail-filters")) errors.push("must keep audit-trail-filters chrome");
  if (!/queryKey:[\s\S]*appliedFilters/.test(src)) errors.push("queryKey must use appliedFilters");
  if (/onClick=\{applyFilters\}/.test(src) || /function applyFilters/.test(src)) {
    errors.push("must not keep hand-rolled applyFilters");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [module, setModule] = useState("");
    function applyFilters() { setApplied({ module, offset: 0 }); }
    <button onClick={applyFilters}>Apply</button>
    <button onClick={resetFilters}>Reset</button>
  `;
  const good = `
    useStagedListFilters({ applied: appliedFilters, empty, onApply });
    queryKey: ["audit-trail", companyId, ...Object.values(appliedFilters), offset],
    <div data-testid="audit-trail-filters" />
    <button data-testid="audit-trail-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="audit-trail-filter-cancel" onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — Audit Trail staged filters with Apply/Cancel/Reset`);
