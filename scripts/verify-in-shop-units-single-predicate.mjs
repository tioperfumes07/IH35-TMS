import fs from "node:fs";

const routeSource = fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8");
const conditionSource = fs.readFileSync("apps/backend/src/maintenance/in-shop-condition.ts", "utf8");
const awaitingSource = fs.readFileSync("apps/backend/src/dispatch/loads.routes.ts", "utf8");
const apiSource = fs.readFileSync("apps/frontend/src/api/dispatch.ts", "utf8");
// 443.231b moved the awaiting feed's in-shop exclusion into THE shared unit gate UNIT_IN_SERVICE_SQL (unit-in-service.ts);
// LEAD 443.265-F (CC-2): read the exclusion where it lives, and require the feed to mount it.
const inServiceSource = fs.readFileSync("apps/backend/src/dispatch/unit-in-service.ts", "utf8");

/** The awaiting feed's in-shop exclusion text and its work-order alias: the shared gate when mounted, else the inline legacy form. */
function awaitingExclusion(awaiting, inService) {
  if (/WHERE \$\{UNIT_IN_SERVICE_SQL\}/.test(awaiting)) return { text: inService, alias: "wo" };
  return { text: awaiting, alias: "awaiting_wo" };
}

function routeSlice(source) {
  const start = source.indexOf('app.get("/api/v1/maintenance/in-shop-units"');
  const end = source.indexOf('app.get("/api/v1/maintenance/fleet-table/rows"', start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function failures(routes = routeSource, condition = conditionSource, awaiting = awaitingSource, api = apiSource, inService = inServiceSource) {
  const route = routeSlice(routes);
  const ex = awaitingExclusion(awaiting, inService);
  const a = ex.alias;
  const checks = [
    [route.length > 0, "narrow in-shop endpoint is mounted"],
    [route.includes('openWorkOrderPredicateSql("wo")'), "endpoint uses the canonical predicate"],
    [condition.includes("voided_at IS NULL") && condition.includes("status NOT IN ('complete', 'cancelled')"), "canonical predicate is non-void and non-terminal"],
    [route.includes("wo.operating_company_id = $1::uuid"), "work orders are company scoped"],
    [route.includes("u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid"), "units are owner-or-lessee scoped"],
    [route.includes("unit_id") && route.includes("unit_number") && route.includes("work_order_id") && route.includes("work_order_display_id"), "identity fields are returned"],
    [route.includes("opened_at") && route.includes("expected_ready_at") && route.includes("shop_or_vendor") && route.includes("days_down") && route.includes("status"), "condition fields are returned"],
    [ex.text.includes(`openWorkOrderPredicateSql("${a}")`), "awaiting feed uses the same predicate"],
    [new RegExp(`AND NOT EXISTS \\([\\s\\S]{0,350}FROM maintenance\\.work_orders ${a}\\b[\\s\\S]{0,300}${a}\\.unit_id = u\\.id[\\s\\S]{0,220}${a}\\.operating_company_id = \\$1::uuid`).test(ex.text), "awaiting feed excludes in-shop units"],
    [api.includes("/api/v1/maintenance/in-shop-units"), "frontend consumes the narrow contract"],
    [!api.includes('listDispatchInShopUnits(operatingCompanyId: string) {\n  return apiRequest<{ rows: DispatchInShopUnit[] }>(\n    `/api/v1/maintenance/fleet-table/rows'), "frontend does not reconstruct condition from Fleet rows"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const real = failures();
  if (real.length) throw new Error(`real tree not clean: ${real.join(", ")}`);
  const base = [routeSource, conditionSource, awaitingSource, apiSource, inServiceSource];
  const mutations = [
    [routeSource.replace('openWorkOrderPredicateSql("wo")', "'TRUE'"), conditionSource, awaitingSource, apiSource, inServiceSource],
    [routeSource, conditionSource.replace("voided_at IS NULL", "TRUE"), awaitingSource, apiSource, inServiceSource],
    [routeSource, conditionSource, awaitingSource, apiSource, inServiceSource.replace('openWorkOrderPredicateSql("wo")', "'TRUE'")],
    [routeSource, conditionSource, awaitingSource, apiSource, inServiceSource.replace("AND NOT EXISTS (", "AND EXISTS (")],
    [routeSource, conditionSource, awaitingSource.replace("WHERE ${UNIT_IN_SERVICE_SQL}", "WHERE true"), apiSource, inServiceSource],
    [routeSource, conditionSource, awaitingSource, apiSource.replace("/api/v1/maintenance/in-shop-units", "/api/v1/maintenance/fleet-table/rows"), inServiceSource],
  ];
  const noop = mutations.filter((args) => args.every((v, i) => v === base[i]));
  if (noop.length) throw new Error(`${noop.length} planted mutation(s) did not change the source`);
  const escaped = mutations.filter((args) => failures(...args).length === 0);
  if (escaped.length) throw new Error(`${escaped.length} planted mutation(s) escaped`);
  console.log(`verify-in-shop-units-single-predicate selftest PASS — ${mutations.length}/${mutations.length} planted mutations red`);
  process.exit(0);
}

const problems = failures();
if (problems.length) {
  console.error(`verify-in-shop-units-single-predicate FAIL — ${problems.join(", ")}`);
  process.exit(1);
}
console.log("verify-in-shop-units-single-predicate PASS — in-shop and awaiting feeds share one mutually exclusive company-scoped predicate");
