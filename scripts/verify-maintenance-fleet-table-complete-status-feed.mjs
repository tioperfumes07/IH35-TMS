import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8");
const fleetPage = fs.readFileSync("apps/frontend/src/pages/maintenance/FleetTablePage.tsx", "utf8");
const dispatchApi = fs.readFileSync("apps/frontend/src/api/dispatch.ts", "utf8");

function routeSlice(source) {
  const start = source.indexOf('app.get("/api/v1/maintenance/fleet-table/rows"');
  const end = source.indexOf('app.get("/api/v1/maintenance/service-location/kpis"', start);
  return source.slice(start, end);
}

function problems(candidateBackend = backend, candidateFleet = fleetPage, candidateDispatch = dispatchApi) {
  const route = routeSlice(candidateBackend);
  const checks = [
    [route.length > 0, "mounted route"],
    [route.includes("u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid"), "owner-or-lessee company scope"],
    [route.includes("u.deactivated_at IS NULL"), "active roster predicate"],
    [route.includes("ORDER BY u.unit_number ASC, u.id ASC"), "deterministic complete feed"],
    [!route.includes("LIMIT 500"), "silent 500 cap removed"],
    [route.includes("wo.operating_company_id = $1::uuid"), "open-work-order entity scope"],
    [route.includes("wo.status NOT IN ('complete', 'cancelled')"), "open-work-order condition predicate"],
    [route.includes("work_order_id") && route.includes("work_order_display_id"), "authoritative work-order identity"],
    [/in_shop\.in_shop_reason/.test(route) && /in_shop\.in_shop_since/.test(route) && /in_shop\.eta_back/.test(route), "authoritative in-shop reason/since/ETA"],
    [route.includes("sre.trigger_wo_id = wo.id"), "ETA belongs to selected open work order"],
    [candidateFleet.includes('`/api/v1/maintenance/fleet-table/rows?operating_company_id=${encodeURIComponent(operatingCompanyId)}`'), "Maintenance consumer"],
    [candidateFleet.includes("...(maintByUnit[r.id] ?? {})"), "Maintenance enrichment consumes complete feed"],
    [candidateFleet.includes("oos_reason: r.in_shop_reason") && candidateFleet.includes("oos_since: r.in_shop_since") && candidateFleet.includes("estimated_completion_date: r.eta_back"), "Maintenance renders authoritative condition fields"],
    [candidateDispatch.includes("listDispatchInShopUnits") && candidateDispatch.includes("/api/v1/maintenance/fleet-table/rows"), "Dispatch in-shop consumer"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("ORDER BY u.unit_number ASC, u.id ASC", "ORDER BY u.unit_number ASC LIMIT 500"), fleetPage, dispatchApi],
    [backend.replace("u.currently_leased_to_company_id = $1::uuid", "u.currently_leased_to_company_id = NULL"), fleetPage, dispatchApi],
    [backend.replace("u.deactivated_at IS NULL", "TRUE"), fleetPage, dispatchApi],
    [backend, fleetPage.replace("...(maintByUnit[r.id] ?? {})", "{}"), dispatchApi],
    [backend, fleetPage.replace("oos_reason: r.in_shop_reason", "oos_reason: null"), dispatchApi],
    [backend, fleetPage, dispatchApi.replace("listDispatchInShopUnits", "listPartialInShopUnits")],
    [backend.replace("wo.operating_company_id = $1::uuid", "TRUE"), fleetPage, dispatchApi],
    [backend.replace("wo.status NOT IN ('complete', 'cancelled')", "TRUE"), fleetPage, dispatchApi],
    [backend.replace("sre.trigger_wo_id = wo.id", "sre.unit_id = u.id"), fleetPage, dispatchApi],
    [backend.replace("in_shop.in_shop_reason,", "NULL::text AS missing_reason,"), fleetPage, dispatchApi],
  ];
  const escaped = mutations.filter(([b, f, d]) => problems(b, f, d).length === 0);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped`);
  console.log(`verify-maintenance-fleet-table-complete-status-feed selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-maintenance-fleet-table-complete-status-feed FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-fleet-table-complete-status-feed PASS — Maintenance enrichment and Dispatch in-shop read the complete scoped active-unit feed");
