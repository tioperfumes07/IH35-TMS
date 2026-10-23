import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8");
const fleetPage = fs.readFileSync("apps/frontend/src/pages/maintenance/FleetTablePage.tsx", "utf8");
const dispatchApi = fs.readFileSync("apps/frontend/src/api/dispatch.ts", "utf8");
const dispatchBoard = fs.readFileSync("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", "utf8");
const dispatchBackend = fs.readFileSync("apps/backend/src/dispatch/loads.routes.ts", "utf8");
const condition = fs.readFileSync("apps/backend/src/maintenance/in-shop-condition.ts", "utf8");
// 443.231b moved the awaiting feed's open-work-order exclusion into THE shared unit gate UNIT_IN_SERVICE_SQL
// (unit-in-service.ts); LEAD 443.265-F (CC-2): read it where it lives and require the feed to mount it.
const inServiceSource = fs.readFileSync("apps/backend/src/dispatch/unit-in-service.ts", "utf8");
function awaitingExclusion(dispatchSrc, inService) {
  if (/WHERE \$\{UNIT_IN_SERVICE_SQL\}/.test(dispatchSrc)) return { text: inService, alias: "wo" };
  return { text: dispatchSrc, alias: "awaiting_wo" };
}

function routeSlice(source) {
  const start = source.indexOf('app.get("/api/v1/maintenance/fleet-table/rows"');
  const end = source.indexOf('app.get("/api/v1/maintenance/service-location/kpis"', start);
  return source.slice(start, end);
}

function inShopRouteSlice(source) {
  const start = source.indexOf('app.get("/api/v1/maintenance/in-shop-units"');
  const end = source.indexOf('app.get("/api/v1/maintenance/fleet-table/rows"', start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function problems(candidateBackend = backend, candidateFleet = fleetPage, candidateDispatch = dispatchApi, candidateDispatchBackend = dispatchBackend, candidateCondition = condition, candidateBoard = dispatchBoard, candidateInService = inServiceSource) {
  const route = routeSlice(candidateBackend);
  const inShopRoute = inShopRouteSlice(candidateBackend);
  const ex = awaitingExclusion(candidateDispatchBackend, candidateInService);
  const a = ex.alias;
  const checks = [
    [inShopRoute.length > 0, "dedicated in-shop-only endpoint"],
    [inShopRoute.includes('openWorkOrderPredicateSql("wo")'), "in-shop endpoint uses canonical open-work-order predicate"],
    [inShopRoute.includes("wo.operating_company_id = $1::uuid"), "in-shop endpoint work-order company scope"],
    [inShopRoute.includes("u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid"), "in-shop endpoint unit company scope"],
    [inShopRoute.includes("unit_id") && inShopRoute.includes("unit_number") && inShopRoute.includes("work_order_id") && inShopRoute.includes("work_order_display_id"), "in-shop endpoint identities"],
    [inShopRoute.includes("opened_at") && inShopRoute.includes("expected_ready_at") && inShopRoute.includes("shop_or_vendor") && inShopRoute.includes("status"), "in-shop endpoint contract fields"],
    [route.length > 0, "mounted route"],
    [route.includes("u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid"), "owner-or-lessee company scope"],
    [route.includes("u.deactivated_at IS NULL"), "active roster predicate"],
    [route.includes("ORDER BY u.unit_number ASC, u.id ASC"), "deterministic complete feed"],
    [!route.includes("LIMIT 500"), "silent 500 cap removed"],
    [route.includes("wo.operating_company_id = $1::uuid"), "open-work-order entity scope"],
    [route.includes('openWorkOrderPredicateSql("wo")'), "maintenance uses canonical open-work-order predicate"],
    [route.includes("work_order_id") && route.includes("work_order_display_id"), "authoritative work-order identity"],
    [/in_shop\.in_shop_reason/.test(route) && /in_shop\.in_shop_since/.test(route) && /in_shop\.eta_back/.test(route), "authoritative in-shop reason/since/ETA"],
    [route.includes("sre.trigger_wo_id = wo.id"), "ETA belongs to selected open work order"],
    [candidateFleet.includes('`/api/v1/maintenance/fleet-table/rows?operating_company_id=${encodeURIComponent(operatingCompanyId)}`'), "Maintenance consumer"],
    [candidateFleet.includes("...(maintByUnit[r.id] ?? {})"), "Maintenance enrichment consumes complete feed"],
    [candidateFleet.includes("oos_reason: r.in_shop_reason") && candidateFleet.includes("oos_since: r.in_shop_since") && candidateFleet.includes("estimated_completion_date: r.eta_back"), "Maintenance renders authoritative condition fields"],
    [candidateDispatch.includes("listDispatchInShopUnits") && candidateDispatch.includes("/api/v1/maintenance/in-shop-units"), "Dispatch consumes narrow in-shop endpoint"],
    [!candidateDispatch.includes('listDispatchInShopUnits(operatingCompanyId: string) {\n  return apiRequest<{ rows: DispatchInShopUnit[] }>(\n    `/api/v1/maintenance/fleet-table/rows'), "Dispatch does not reconstruct in-shop state from whole Fleet feed"],
    [candidateDispatch.includes("work_order_id") && candidateDispatch.includes("work_order_display_id") && candidateDispatch.includes("opened_at") && candidateDispatch.includes("expected_ready_at") && candidateDispatch.includes("shop_or_vendor") && candidateDispatch.includes("days_down"), "Dispatch in-shop API type preserves six-field contract"],
    [candidateBoard.includes('data-testid="dispatch-in-shop-details"') && candidateBoard.includes("Shop") && candidateBoard.includes("Opened") && candidateBoard.includes("ETA") && candidateBoard.includes("Days down"), "In-shop band renders Unit/WO/Shop/Opened/ETA/Days down"],
    [candidateCondition.includes("voided_at IS NULL") && candidateCondition.includes("status NOT IN ('complete', 'cancelled')"), "canonical open-work-order predicate"],
    [ex.text.includes(`openWorkOrderPredicateSql("${a}")`), "awaiting feed uses canonical open-work-order predicate"],
    [new RegExp(`AND NOT EXISTS \\([\\s\\S]{0,300}FROM maintenance\\.work_orders ${a}\\b[\\s\\S]{0,260}${a}\\.unit_id = u\\.id[\\s\\S]{0,180}${a}\\.operating_company_id = \\$1::uuid`).test(ex.text), "awaiting feed excludes same-company open work orders"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("ORDER BY u.unit_number ASC, u.id ASC", "ORDER BY u.unit_number ASC LIMIT 500"), fleetPage, dispatchApi],
    [backend.replaceAll("u.currently_leased_to_company_id = $1::uuid", "u.currently_leased_to_company_id = NULL"), fleetPage, dispatchApi],
    [backend.replaceAll("u.deactivated_at IS NULL", "TRUE"), fleetPage, dispatchApi],
    [backend, fleetPage.replace("...(maintByUnit[r.id] ?? {})", "{}"), dispatchApi],
    [backend, fleetPage.replace("oos_reason: r.in_shop_reason", "oos_reason: null"), dispatchApi],
    [backend, fleetPage, dispatchApi.replace("listDispatchInShopUnits", "listPartialInShopUnits")],
    [backend.replaceAll("wo.operating_company_id = $1::uuid", "TRUE"), fleetPage, dispatchApi],
    [backend.replaceAll('openWorkOrderPredicateSql("wo")', "'TRUE'"), fleetPage, dispatchApi],
    [backend.replaceAll("sre.trigger_wo_id = wo.id", "sre.unit_id = u.id"), fleetPage, dispatchApi],
    [backend.replace("in_shop.in_shop_reason,", "NULL::text AS missing_reason,"), fleetPage, dispatchApi],
  ];
  const extendedMutations = [
    ...mutations.map(([b, f, d]) => [b, f, d, dispatchBackend, condition]),
    [backend, fleetPage, dispatchApi, dispatchBackend, condition, dispatchBoard, inServiceSource.replace('openWorkOrderPredicateSql("wo")', "'TRUE'")],
    [backend, fleetPage, dispatchApi, dispatchBackend, condition, dispatchBoard, inServiceSource.replace("AND NOT EXISTS (", "AND EXISTS (")],
    [backend, fleetPage, dispatchApi, dispatchBackend, condition, dispatchBoard, inServiceSource.replace("wo.operating_company_id = $1::uuid", "TRUE")],
    [backend, fleetPage, dispatchApi, dispatchBackend.replace("WHERE ${UNIT_IN_SERVICE_SQL}", "WHERE true"), condition],
    [backend, fleetPage, dispatchApi, dispatchBackend, condition.replace("voided_at IS NULL", "TRUE")],
    [backend.replace('app.get("/api/v1/maintenance/in-shop-units"', 'app.get("/api/v1/maintenance/removed-in-shop-units"'), fleetPage, dispatchApi, dispatchBackend, condition],
    [backend.replaceAll('openWorkOrderPredicateSql("wo")', "'TRUE'"), fleetPage, dispatchApi, dispatchBackend, condition],
  ];
  extendedMutations.push(
    [backend, fleetPage, dispatchApi.replace("/api/v1/maintenance/in-shop-units", "/api/v1/maintenance/fleet-table/rows"), dispatchBackend, condition, dispatchBoard],
    [backend, fleetPage, dispatchApi.replace("days_down: number;", ""), dispatchBackend, condition, dispatchBoard],
    [backend, fleetPage, dispatchApi, dispatchBackend, condition, dispatchBoard.replace('data-testid="dispatch-in-shop-details"', 'data-testid="dispatch-in-shop-summary"')],
  );
  const real = problems();
  if (real.length) throw new Error(`real tree not clean: ${real.join(", ")}`);
  const base = [backend, fleetPage, dispatchApi, dispatchBackend, condition, dispatchBoard, inServiceSource];
  const noop = extendedMutations.filter((m) => base.every((v, i) => (m[i] ?? v) === v));
  if (noop.length) throw new Error(`${noop.length} planted defect(s) did not change the source`);
  const escaped = extendedMutations.filter(([b, f, d, db = dispatchBackend, c = condition, board = dispatchBoard, inSvc = inServiceSource]) => problems(b, f, d, db, c, board, inSvc).length === 0);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped`);
  console.log(`verify-maintenance-fleet-table-complete-status-feed selftest PASS — ${extendedMutations.length}/${extendedMutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-maintenance-fleet-table-complete-status-feed FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-fleet-table-complete-status-feed PASS — Maintenance enrichment and Dispatch in-shop read the complete scoped active-unit feed");
