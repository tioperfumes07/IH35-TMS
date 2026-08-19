#!/usr/bin/env node
/**
 * verify-idvr-staged-filters
 * LV-SAFETY-IDVR-FILTER-SILENT-APPLY — IdvrPage must stage filters via
 * useStagedListFilters with Apply + Cancel + Reset; query keys applied.*;
 * LST-F5188 URL sync remains on Apply (not silent draft).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-idvr-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/IdvrPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="idvr-filter-cancel"')) errors.push("must expose idvr-filter-cancel");
  if (!src.includes('data-testid="idvr-filter-apply"')) errors.push("must expose idvr-filter-apply");
  if (!src.includes('data-testid="idvr-filters"')) errors.push("must keep idvr-filters chrome");
  if (!/applied\.driverId/.test(src) || !/applied\.from/.test(src)) {
    errors.push("queryParams must use applied.* (not draft/silent state)");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src)) {
    errors.push("must keep LST-F5188 URL sync (setSearchParams + driver_id)");
  }
  if (/\bfunction\s+setDriverFilter\s*\(/.test(src) || /const \[fromDate,\s*setFromDate\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter setters");
  }
  if (/onChange=\{\(next\) => setDriverFilter\(/.test(src) || /onChange=\{\(next\) => setFromDate\(/.test(src)) {
    errors.push("pickers/dates must bind draft via staged.setDraft, not silent setters");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [fromDate, setFromDate] = useState("");
    function setDriverFilter(next) { setDriverFilterState(next); patchSearchParam("driver_id", next); }
    queryParams: { driver_id: driverFilter, from: fromDate }
    <DatePicker value={fromDate} onChange={(next) => setFromDate(next)} />
    <EntityPicker onChange={(next) => setDriverFilter(next ?? "")} />
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); setSearchParams(p); } });
    queryParams: { driver_id: applied.driverId, from: applied.from }
    searchParams.get("driver_id")
    <div data-testid="idvr-filters" />
    <button data-testid="idvr-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="idvr-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <EntityPicker value={draft.driverId || null} onChange={(next) => staged.setDraft((d) => ({ ...d, driverId: next ?? "" }))} />
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
console.log(`${LABEL} PASS — Idvr staged filters with Apply/Cancel/Reset + URL on Apply`);
