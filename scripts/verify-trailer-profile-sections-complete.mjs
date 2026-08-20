#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","fleet","fuel","accounting","drivers"],"cols":["load","trailer","connectivity","reverse_link"],"leafRe":"^(load\\.|secondary\\.book_load|home\\.|roster\\.|unit\\.|trailer\\.|expenses\\.|fuel|history|driver)","task":"P31+CREATE-PATH-TRIP-TRAILER-REVERSE+ACCT-F5031","pr":"#5830+#6343+#6407"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx";
const SERVICE = "apps/backend/src/mdata/equipment-aggregate.service.ts";
const DRIVER_PAGE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const LOAD_DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const VEHICLE_PAGE = "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx";
const EXPENSE_ROUTES = "apps/backend/src/accounting/expenses.routes.ts";
const WO_DETAIL = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";

export function problems(
  page,
  service,
  driverPage = "",
  loadDrawer = "",
  vehiclePage = "",
  expenseRoutes = "",
  woDetail = ""
) {
  const failures = [];
  for (const id of [
    "tp-section-1-identity",
    "tp-section-2-specs",
    "tp-section-3-assignment",
    "tp-section-5-maintenance",
    "tp-section-6-compliance",
    "tp-section-7-documents",
    "tp-section-8-action-bar",
  ]) {
    if (!page.includes(id)) failures.push(`missing ${id}`);
  }

  // P31: a trailer's reverse history must use the persisted assignment FK, include inactive
  // historical loads, and render a canonical link back to the load drawer.
  if (!/FROM dispatch\.load_assignment_history lah[\s\S]{0,500}?lah\.new_trailer_id = \$1::uuid/.test(service)) {
    failures.push("P31 reverse read must use load_assignment_history.new_trailer_id");
  }
  if (!/lah\.operating_company_id = \$2::uuid/.test(service)) {
    failures.push("P31 reverse read must be operating-company scoped");
  }
  if (!/data-testid="tp-section-3b-load-history"/.test(page) || !/<EntityLinkOrTombstone[\s\S]{0,160}?kind="load"[\s\S]{0,180}?noun="Load"/.test(page)) {
    failures.push("P31 trailer profile must render linked load history with a canonical link or tombstone");
  }

  // FLEET-TRAILER-WO-REVERSE-SCOPE: the mounted trailer maintenance panel must be produced from
  // maintenance.work_orders.equipment_id. current_unit_id is contextual power-unit data, not the
  // trailer FK, and would both leak unit WOs and false-empty unattached trailers.
  const equipmentScopedWoReads = service.match(/FROM maintenance\.work_orders w[\s\S]{0,220}?w\.equipment_id = \$1::uuid[\s\S]{0,140}?w\.operating_company_id = \$2::uuid[\s\S]{0,100}?w\.voided_at IS NULL/g) ?? [];
  if (equipmentScopedWoReads.length < 3) {
    failures.push("trailer work-order count, last service, and reverse list must use the scoped equipment_id FK");
  }
  if (/const maintUnitId = unitId/.test(service)) {
    failures.push("trailer maintenance must not be gated through the currently attached unit");
  }

  // CREATE-PATH-TRIP #6343 — trailer profile must mount fuel + expense reverse (list filters #6340).
  if (!/FuelTransactionsReverseSection[\s\S]{0,220}?filter=\{\{\s*trailer_id:/.test(page)) {
    failures.push("CREATE-PATH-TRIP: TrailerProfile must mount FuelTransactionsReverseSection filter={{ trailer_id }}");
  }
  if (!/ExpensesReverseSection[\s\S]{0,220}?filter=\{\{\s*trailer_id:/.test(page)) {
    failures.push("CREATE-PATH-TRIP: TrailerProfile must mount ExpensesReverseSection filter={{ trailer_id }}");
  }

  // ACCT-F5031 — same ExpensesReverseSection filter-union must be mounted on driver + load surfaces.
  if (driverPage) {
    if (!/ExpensesReverseSection[\s\S]{0,220}?filter=\{\{\s*driver_id:/.test(driverPage)) {
      failures.push("ACCT-F5031: DriverProfile must mount ExpensesReverseSection filter={{ driver_id }}");
    }
    if (!/FuelTransactionsReverseSection[\s\S]{0,220}?filter=\{\{\s*driver_id:/.test(driverPage)) {
      failures.push("ACCT-F5031: DriverProfile must mount FuelTransactionsReverseSection filter={{ driver_id }}");
    }
  }
  if (loadDrawer) {
    if (!/ExpensesReverseSection[\s\S]{0,220}?filter=\{\{\s*load_id:/.test(loadDrawer)) {
      failures.push("ACCT-F5031: LoadDetailDrawer must mount ExpensesReverseSection filter={{ load_id }}");
    }
  }
  if (vehiclePage) {
    if (!/ExpensesReverseSection[\s\S]{0,220}?filter=\{\{\s*unit_id:/.test(vehiclePage)) {
      failures.push("ACCT-F5032: VehicleProfile must mount ExpensesReverseSection filter={{ unit_id }}");
    }
  }
  if (expenseRoutes) {
    if (!/unitId\?: string;/.test(expenseRoutes) || !/unitId: q\.unit_id,/.test(expenseRoutes)) {
      failures.push("ACCT-F5032: expenses list must accept unit_id filter (unitId passthrough)");
    }
    if (!/if \(filters\.unitId\) \{/.test(expenseRoutes)) {
      failures.push("ACCT-F5032: queryExpensesList must filter on e.unit_id");
    }
    if (!/workOrderId\?: string;/.test(expenseRoutes) || !/workOrderId: q\.work_order_id,/.test(expenseRoutes)) {
      failures.push("ACCT-F5033: expenses list must accept work_order_id filter");
    }
    if (!/if \(filters\.workOrderId\) \{/.test(expenseRoutes)) {
      failures.push("ACCT-F5033: queryExpensesList must filter on e.linked_work_order_uuid");
    }
  }
  if (woDetail) {
    if (!/ExpensesReverseSection[\s\S]{0,280}?filter=\{\{\s*work_order_id:/.test(woDetail)) {
      failures.push("ACCT-F5033: WorkOrderDetailPage must mount ExpensesReverseSection filter={{ work_order_id }}");
    }
  }
  return failures;
}

function selftest() {
  const page = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const service = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const driverPage = fs.readFileSync(path.join(ROOT, DRIVER_PAGE), "utf8");
  const loadDrawer = fs.readFileSync(path.join(ROOT, LOAD_DRAWER), "utf8");
  const vehiclePage = fs.readFileSync(path.join(ROOT, VEHICLE_PAGE), "utf8");
  const expenseRoutes = fs.readFileSync(path.join(ROOT, EXPENSE_ROUTES), "utf8");
  const woDetail = fs.readFileSync(path.join(ROOT, WO_DETAIL), "utf8");
  const cases = [
    ["baseline", page, service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, 0],
    ["history FK removed", page, service.replace("lah.new_trailer_id = $1::uuid", "lah.new_unit_id = $1::uuid"), driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, 1],
    ["trailer WO FK regressed to unit", page, service.replaceAll("w.equipment_id = $1::uuid", "w.unit_id = $1::uuid"), driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, 1],
    ["wo expense reverse removed", page, service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail.replace(/ExpensesReverseSection/g, "GoneExpense"), 1],
    ["wo list filter removed", page, service, driverPage, loadDrawer, vehiclePage, expenseRoutes.replace(/if \(filters\.workOrderId\) \{/g, "if (false) {"), woDetail, 1],
  ];
  for (const [name, p, s, d, l, v, e, w, minimum] of cases) {
    const count = problems(p, s, d, l, v, e, w).length;
    if (count < minimum || (minimum === 0 && count !== 0)) {
      console.error(`verify:trailer-profile-sections-complete SELFTEST FAIL: ${name} produced ${count}`);
      process.exit(1);
    }
  }
  console.log("verify:trailer-profile-sections-complete SELFTEST PASS — P31 + ACCT-F5031/5032/5033 reverse mutations caught");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = problems(
  fs.readFileSync(path.join(ROOT, PAGE), "utf8"),
  fs.readFileSync(path.join(ROOT, SERVICE), "utf8"),
  fs.readFileSync(path.join(ROOT, DRIVER_PAGE), "utf8"),
  fs.readFileSync(path.join(ROOT, LOAD_DRAWER), "utf8"),
  fs.readFileSync(path.join(ROOT, VEHICLE_PAGE), "utf8"),
  fs.readFileSync(path.join(ROOT, EXPENSE_ROUTES), "utf8"),
  fs.readFileSync(path.join(ROOT, WO_DETAIL), "utf8"),
);
if (failures.length) {
  for (const failure of failures) console.error(`verify:trailer-profile-sections-complete FAIL: ${failure}`);
  process.exit(1);
}
console.log("verify:trailer-profile-sections-complete PASS — P31 + ACCT-F5031/5032/5033 reverse mounts intact");
