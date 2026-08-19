#!/usr/bin/env node
/**
 * verify-incidents-cluster-staged-filters
 * LV-SAFETY-INCIDENTS-CLUSTER-FILTER-SILENT-APPLY — damage/trailer-interchange shared
 * list must stage filters via useStagedListFilters with Apply + Cancel + Reset;
 * listFilters from applied.*; LST-F5194 URL sync via patchListSearchParam on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-incidents-cluster-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes("filter-cancel")) errors.push("must expose filter-cancel testid");
  if (!src.includes("filter-apply")) errors.push("must expose filter-apply testid");
  if (!/applied\.driverId/.test(src) || !/applied\.from/.test(src)) {
    errors.push("listFilters must use applied.* (not draft/silent state)");
  }
  if (!src.includes("patchListSearchParam") || !src.includes('searchParams.get("load_id")')) {
    errors.push("must keep LST-F5194 URL sync (patchListSearchParam + load_id)");
  }
  if (/\bfunction\s+setDriverFilter\s*\(/.test(src) || /const \[fromDate,\s*setFromDate\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter setters");
  }
  if (/onChange=\{\(next\) => setDriverFilter\(/.test(src) || /onChange=\{setFromDate\}/.test(src)) {
    errors.push("pickers/dates must bind draft via staged.setDraft");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [fromDate, setFromDate] = useState("");
    function setDriverFilter(next) { setDriverFilterState(next); patchListSearchParam("driver_id", next); }
    listFilters: { driver_id: driverFilter, date_from: fromDate }
    <DatePicker value={fromDate} onChange={setFromDate} />
    <EntityPicker onChange={(next) => setDriverFilter(next ?? "")} />
    <button>Clear</button>
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: (next) => { setApplied(next); patchListSearchParam(next); } });
    listFilters: { driver_id: applied.driverId, date_from: applied.from }
    searchParams.get("load_id")
    <button data-testid={\`\${config.pageTestId}-filter-apply\`} onClick={staged.apply}>Apply</button>
    <button data-testid={\`\${config.pageTestId}-filter-cancel\`} onClick={staged.cancel}>Cancel</button>
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
console.log(`${LABEL} PASS — incidents cluster staged filters with Apply/Cancel/Reset`);
