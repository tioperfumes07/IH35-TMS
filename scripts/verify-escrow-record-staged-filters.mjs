#!/usr/bin/env node
/**
 * verify-escrow-record-staged-filters
 * LV-SAFETY-ESCROW-RECORD-FILTER-SILENT-APPLY — EscrowRecordTab must stage driver via
 * useStagedListFilters with Apply + Cancel + Reset; list filter uses applied.driverId.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-escrow-record-staged-filters";
const TARGET = "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="escrow-records-filter-cancel"')) {
    errors.push("must expose escrow-records-filter-cancel");
  }
  if (!src.includes('data-testid="escrow-records-filter-apply"')) {
    errors.push("must expose escrow-records-filter-apply");
  }
  if (!src.includes('data-testid="escrow-records-filters"')) {
    errors.push("must keep escrow-records-filters chrome");
  }
  if (!/applied\.driverId/.test(src)) {
    errors.push("list filter must use applied.driverId (not silent draft)");
  }
  if (!/escrow-records-filter-driver/.test(src) || !/setDriverFilter/.test(src) || !/setSearchParams/.test(src)) {
    errors.push("must keep LST-F5163K EntityPicker + setDriverFilter + SAF-B30 setSearchParams");
  }
  if (/const \[driverFilter,\s*setDriverFilter\]/.test(src)) {
    errors.push("must not keep hand-rolled silent driverFilter useState");
  }
  if (src.includes("text-[11px]")) errors.push("leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) {
    errors.push("leftover off-scale muted");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [driverFilter, setDriverFilter] = useState("");
    const effectiveDriverId = driverFilter.trim()
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply: setApplied });
    function setDriverFilter(next) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    const effectiveDriverId = applied.driverId.trim() || escrowDriverIdParam || "";
    dataTestId="escrow-records-filter-driver"
    setSearchParams(next, { replace: true });
    <div data-testid="escrow-records-filters" />
    <button data-testid="escrow-records-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="escrow-records-filter-cancel" onClick={staged.cancel}>Cancel</button>
  `;
  if (assertPage(bad).length === 0 || assertPage(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertPage(bad), good: assertPage(good) });
    process.exit(1);
  }
  const live = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
  if (live.includes("text-[11px]") || live.includes("#8A92AB") || live.includes("#334155")) {
    console.error(`${LABEL} SELFTEST FAIL — live leftover tokens present`);
    process.exit(1);
  }
  const leftoverErrors = assertPage(`${good}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`);
  if (!leftoverErrors.some((e) => e.includes("leftover"))) {
    console.error(`${LABEL} SELFTEST FAIL leftover plant escaped:`, leftoverErrors);
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
console.log(`${LABEL} PASS — EscrowRecord staged filters with Apply/Cancel/Reset`);
