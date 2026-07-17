#!/usr/bin/env node
// Guard (BANK-SORT-ROLLOUT-OPS): every visible data column on the three OPS list surfaces —
// dispatch board, settlements list, maintenance fleet-table/work-orders list — is ASC/DESC
// sortable, and the sort choice persists in the URL (?sort=/?dir=) so a refresh or a
// shared/bookmarked link keeps it. Companion to verify-global-sort-rule.mjs (per-column
// `sortable: true` contract) and verify-parity-table-resize-sort-contract.mjs (ParityTable).
import { readFileSync } from "node:fs";

const failures = [];
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    failures.push(`${p}: missing`);
    return "";
  }
};

// ---------------------------------------------------------------------------
// 1. The shared hook must exist and expose the ?sort=/?dir= contract.
// ---------------------------------------------------------------------------
const hookPath = "apps/frontend/src/hooks/useUrlSort.ts";
const hook = read(hookPath);
if (hook) {
  if (!/useSearchParams/.test(hook)) failures.push(`${hookPath}: must read/write via react-router useSearchParams`);
  if (!/key:\s*["']sort["']/.test(hook)) failures.push(`${hookPath}: default key param must be "sort"`);
  if (!/dir:\s*["']dir["']/.test(hook)) failures.push(`${hookPath}: default dir param must be "dir"`);
  if (!/toggleSort/.test(hook)) failures.push(`${hookPath}: must export a toggleSort(key) header-click cycle (BANK-SORT-ROLLOUT-OPS)`);
  if (!/export function useUrlSort/.test(hook)) failures.push(`${hookPath}: must export useUrlSort`);
}

// ---------------------------------------------------------------------------
// 2. Dispatch board (primary dispatch list surface) — URL-persisted sort wired to every
//    plain-data column (computed/live-widget cells like HOS/cargo-temp/live-GPS are exempt,
//    same carve-out class as GLOBAL-SORT-RULE action columns).
// ---------------------------------------------------------------------------
const dispatchPath = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const dispatch = read(dispatchPath);
if (dispatch) {
  if (!/useUrlSort/.test(dispatch)) failures.push(`${dispatchPath}: must wire useUrlSort (URL-persisted sort)`);
  if (!/DISPATCH_SORTABLE_COLS/.test(dispatch)) failures.push(`${dispatchPath}: must define the sortable-column allowlist`);
  for (const col of ["load", "unit", "trailer", "driver", "customer", "commodity", "pickup", "delivery", "wo", "linehaul", "status"]) {
    const re = new RegExp(`DISPATCH_SORTABLE_COLS[\\s\\S]{0,400}?"${col}"`);
    if (!re.test(dispatch)) failures.push(`${dispatchPath}: column "${col}" must be in DISPATCH_SORTABLE_COLS`);
  }
  if (!/dispatchSortValue/.test(dispatch)) failures.push(`${dispatchPath}: must define dispatchSortValue for client-side sort`);
}

// ---------------------------------------------------------------------------
// 3. Settlements list — TableHeaderCell-driven ASC/DESC on every real data column + URL persistence.
// ---------------------------------------------------------------------------
const settlementsPath = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";
const settlements = read(settlementsPath);
if (settlements) {
  if (!/useUrlSort/.test(settlements)) failures.push(`${settlementsPath}: must wire useUrlSort (URL-persisted sort)`);
  if (!/TableHeaderCell/.test(settlements)) failures.push(`${settlementsPath}: must render sortable headers via TableHeaderCell`);
  for (const col of ["driver", "period", "gross", "deductions", "net_pay", "status", "debt_flag"]) {
    if (!new RegExp(`key:\\s*["']${col}["'][^}]*sortable:\\s*true`).test(settlements)) {
      failures.push(`${settlementsPath}: column "${col}" must be sortable: true`);
    }
  }
  if (!/settlementSortValue/.test(settlements)) failures.push(`${settlementsPath}: must define settlementSortValue for client-side sort`);
}

// ---------------------------------------------------------------------------
// 4. Maintenance fleet table — already-sortable TableHeaderCell/useTableController grid, now
//    with ?sort=/?dir= URL persistence via useUrlSort feeding useTableController's initial state.
// ---------------------------------------------------------------------------
const fleetPath = "apps/frontend/src/components/FleetTable.tsx";
const fleet = read(fleetPath);
if (fleet) {
  if (!/useUrlSort/.test(fleet)) failures.push(`${fleetPath}: must wire useUrlSort (URL-persisted sort)`);
  if (!/initialSortKey:\s*urlSort\.sortKey/.test(fleet)) failures.push(`${fleetPath}: must seed useTableController from urlSort.sortKey`);
  if (!/onSortChange:[\s\S]{0,80}urlSort\.onSortChange/.test(fleet)) {
    failures.push(`${fleetPath}: must mirror header clicks back into the URL via urlSort.onSortChange`);
  }
  if (!/TableHeaderCell/.test(fleet)) failures.push(`${fleetPath}: must render sortable headers via TableHeaderCell`);
}

const controllerPath = "apps/frontend/src/components/table/useTableController.ts";
const controller = read(controllerPath);
if (controller) {
  if (!/initialSortKey/.test(controller) || !/initialSortDir/.test(controller)) {
    failures.push(`${controllerPath}: must accept optional initialSortKey/initialSortDir so a page can seed sort from the URL`);
  }
}

// ---------------------------------------------------------------------------
// 5. Maintenance work-orders console — the sort selector persists in the URL (fixed backend
//    sort enum, not per-column asc/desc — see WorkOrdersConsoleListPage.tsx comment).
// ---------------------------------------------------------------------------
const woPath = "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx";
const wo = read(woPath);
if (wo) {
  if (!/useSearchParams/.test(wo)) failures.push(`${woPath}: sort selection must persist via useSearchParams (?sort=)`);
  if (!/searchParams\.get\(["']sort["']\)/.test(wo)) failures.push(`${woPath}: must read the initial sort from ?sort=`);
}

if (failures.length) {
  console.error("verify:ops-sortable-headers — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(
  "verify:ops-sortable-headers — OK (dispatch board, settlements, fleet-table/work-orders: ASC/DESC + URL-persisted sort)"
);
