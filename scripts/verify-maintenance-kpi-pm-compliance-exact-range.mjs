import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/kpi.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx", "utf8");

function mutateRoute(source, from, to) {
  const start = source.indexOf('app.get("/api/v1/maintenance/kpi/pm-compliance"');
  const end = source.indexOf("async function countActiveUnits", start);
  return source.slice(0, start) + source.slice(start, end).replaceAll(from, to) + source.slice(end);
}

function problems(b = backend, a = api, p = page) {
  const start = b.indexOf('app.get("/api/v1/maintenance/kpi/pm-compliance"');
  const end = b.indexOf("async function countActiveUnits", start);
  const route = b.slice(start, end);
  const checks = [
    [b.includes("const pmComplianceQuerySchema = kpiQuerySchema.extend"), "bounded range schema"],
    [route.includes("LIMIT $${limitParam}") && route.includes("OFFSET $${offsetParam}"), "bound server range"],
    [route.includes("COUNT(*)::int AS total_count"), "exact total"],
    [route.includes("ps.operating_company_id = $1::uuid") && route.includes("ps.is_active = true"), "identical company/active graph"],
    [!route.includes("LIMIT 200"), "silent 200 cap removed"],
    [a.includes("range: { limit?: number; offset?: number } = {}") && a.includes('params.set("offset"'), "typed API range"],
    [p.includes("offset: (pmPage - 1) * pmPageSize"), "page reaches API"],
    [p.includes('data-testid="maint-kpi-pm-server-pager"'), "visible exact pager"],
    [p.includes("useEffect(() => { setPmPage(1); setDrillPage(1); }, [companyId, periodStart, periodEnd, unitId]);"), "scope reset"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("LIMIT $${limitParam}", "LIMIT 200"), api, page],
    [mutateRoute(backend, "COUNT(*)::int AS total_count", "200::int AS total_count"), api, page],
    [mutateRoute(backend, "ps.is_active = true", "TRUE"), api, page],
    [backend, api.replaceAll('params.set("offset"', 'params.set("offsetValue"'), page],
    [backend, api, page.replace('data-testid="maint-kpi-pm-server-pager"', 'data-testid="missing-pager"')],
    [backend, api, page.replace("setPmPage(1)", "void pmPage")],
  ];
  const escaped = mutations.filter(([b, a, p]) => problems(b, a, p).length === 0);
  if (escaped.length) {
    const escapedIndexes = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
    throw new Error(`${escaped.length} planted defect(s) escaped: ${escapedIndexes.join(",")}`);
  }
  console.log(`verify-maintenance-kpi-pm-compliance-exact-range selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-maintenance-kpi-pm-compliance-exact-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-kpi-pm-compliance-exact-range PASS — PM compliance drill-down has exact scoped server range and lifecycle pager");
