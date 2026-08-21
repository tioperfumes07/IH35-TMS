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
const ASSIGNMENT = "apps/frontend/src/components/trailer-profile/CurrentAssignmentSection.tsx";

export function problems(
  page,
  service,
  driverPage = "",
  loadDrawer = "",
  vehiclePage = "",
  expenseRoutes = "",
  woDetail = "",
  assignment = ""
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

  // LV-FLEET-TRAILER-PROFILE-HUNG — the production aggregate can stall; never leave operators on
  // an infinite loading card. Match the unit profile's bounded read + actionable retry contract.
  if (!/AbortSignal\.timeout\(15_000\)/.test(page) || !/signal: ctrl\.signal/.test(page)) {
    failures.push("trailer profile aggregate must use a bounded abort signal");
  }
  if (!/profileQ\.isError/.test(page) || !/Couldn't load trailer profile/.test(page) || !/onRetry=\{\(\) => void profileQ\.refetch\(\)\}/.test(page)) {
    failures.push("trailer profile must replace failed loading with an actionable retry state");
  }
  if (!/equipment\.assigned_driver_id/.test(service) || !/FROM mdata\.drivers d[\s\S]{0,500}?dca\.company_id = \$2::uuid/.test(service)) {
    failures.push("trailer assigned driver must resolve through an explicitly company-scoped reverse read");
  }
  if (!/current_assignment: \{ attached_to_unit, current_load, assigned_driver \}/.test(service)) {
    failures.push("trailer aggregate must return the assigned driver in current_assignment");
  }
  if (!/kind="driver"[\s\S]{0,160}?name=\{driver\.name\}[\s\S]{0,100}?noun="Driver"/.test(assignment)) {
    failures.push("trailer profile must render its assigned driver as a canonical reverse drill");
  }
  if (!/onQuickAssign=\{\(\) => setQuickAssignOpen\(true\)\}/.test(page) || !/equipmentKind: "trailer"/.test(page)) {
    failures.push("trailer profile must expose the canonical trailer driver quick-assign creator");
  }
  if (!/quicksaveEquipmentAssignment\(\{[\s\S]{0,180}?operating_company_id: companyId[\s\S]{0,180}?driver_id: driverId/.test(page)) {
    failures.push("trailer quick assign must persist the selected driver through the canonical scoped endpoint");
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
  if (!/FROM mdata\.loads l[\s\S]{0,120}?l\.assigned_unit_id = \$1::uuid[\s\S]{0,120}?l\.operating_company_id = \$2::uuid/.test(service)) {
    failures.push("attached trailer context must resolve the current load through canonical assigned_unit_id with company scope");
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
  const assignment = fs.readFileSync(path.join(ROOT, ASSIGNMENT), "utf8");
  const cases = [
    ["baseline", page, service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 0],
    ["history FK removed", page, service.replace("lah.new_trailer_id = $1::uuid", "lah.new_unit_id = $1::uuid"), driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
    ["trailer WO FK regressed to unit", page, service.replaceAll("w.equipment_id = $1::uuid", "w.unit_id = $1::uuid"), driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
    ["current-load unit FK regressed", page, service.replace("l.assigned_unit_id = $1::uuid", "l.assigned_primary_unit_id = $1::uuid"), driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
    ["wo expense reverse removed", page, service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail.replace(/ExpensesReverseSection/g, "GoneExpense"), assignment, 1],
    ["wo list filter removed", page, service, driverPage, loadDrawer, vehiclePage, expenseRoutes.replace(/if \(filters\.workOrderId\) \{/g, "if (false) {"), woDetail, assignment, 1],
    ["aggregate timeout removed", page.replace("AbortSignal.timeout(15_000)", "undefined"), service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
    ["retry state removed", page.replace("Couldn't load trailer profile", "Trailer unavailable"), service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
    ["assigned driver scope removed", page, service.replace("dca.company_id = $2::uuid", "TRUE"), driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
    ["assigned driver payload removed", page, service.replace("current_assignment: { attached_to_unit, current_load, assigned_driver }", "current_assignment: { attached_to_unit, current_load }"), driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
    ["assigned driver drill removed", page, service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment.replace('kind="driver"', 'kind="vendor"'), 1],
    ["trailer quick assign trigger removed", page.replace("onQuickAssign={() => setQuickAssignOpen(true)}", ""), service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
    ["trailer quick assign kind regressed", page.replace('equipmentKind: "trailer"', 'equipmentKind: "truck"'), service, driverPage, loadDrawer, vehiclePage, expenseRoutes, woDetail, assignment, 1],
  ];
  for (const [name, p, s, d, l, v, e, w, a, minimum] of cases) {
    const count = problems(p, s, d, l, v, e, w, a).length;
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
  fs.readFileSync(path.join(ROOT, ASSIGNMENT), "utf8"),
);
if (failures.length) {
  for (const failure of failures) console.error(`verify:trailer-profile-sections-complete FAIL: ${failure}`);
  process.exit(1);
}
console.log("verify:trailer-profile-sections-complete PASS — P31 + ACCT-F5031/5032/5033 reverse mounts intact");
