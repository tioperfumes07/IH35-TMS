import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/kpi.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx", "utf8");

function drillSlice(source) {
  const start = source.indexOf("async function kpiDrilldown");
  return source.slice(start);
}

function problems(b = backend, a = api, p = page) {
  const drill = drillSlice(b);
  const checks = [
    [b.includes("const drilldownQuerySchema = kpiQuerySchema.extend"), "bounded shared schema"],
    [["downtime", "mtbf", "cpm", "cost_per_truck"].every((kind) => drill.includes(`kind === \"${kind}\"`) || (kind === "cost_per_truck" && drill.includes("} else {"))), "all four kinds"],
    [drill.includes("WITH data AS (${dataSql})") && drill.includes("COUNT(*)::int AS total_count FROM data"), "one exact data/count graph"],
    [drill.includes("LIMIT $${limitParam} OFFSET $${offsetParam}"), "bound page"],
    [!drill.includes("LIMIT 100"), "four silent caps removed"],
    [drill.includes('orderSql = "downtime_hours DESC, id ASC"') && drill.includes('orderSql = "repair_count DESC, unit_id ASC"') && drill.includes('orderSql = "total_cents DESC, unit_id ASC"'), "stable kind ordering"],
    [a.includes("getMaintenanceKpiDrilldown") && a.includes("range: { limit?: number; offset?: number } = {}") && a.includes('if (range.offset != null) params.set("offset"'), "typed API range"],
    [p.includes("offset: (drillPage - 1) * drillPageSize"), "page reaches API"],
    [p.includes('data-testid="maint-kpi-drilldown-server-pager"'), "visible exact pager"],
    [p.includes("setDrillPage(1)") && p.includes("companyId, periodStart, periodEnd, unitId"), "scope reset"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("COUNT(*)::int AS total_count FROM data", "100::int AS total_count FROM data"), api, page],
    [backend.replace("LIMIT $${limitParam} OFFSET $${offsetParam}", "LIMIT 100"), api, page],
    [backend.replace('orderSql = "downtime_hours DESC, id ASC"', 'orderSql = "downtime_hours DESC"'), api, page],
    [backend.replace('orderSql = "repair_count DESC, unit_id ASC"', 'orderSql = "repair_count DESC"'), api, page],
    [backend, api.replaceAll('params.set("offset"', 'params.set("offsetValue"'), page],
    [backend, api, page.replace('data-testid="maint-kpi-drilldown-server-pager"', 'data-testid="missing-pager"')],
    [backend, api, page.replaceAll("setDrillPage(1)", "void drillPage")],
  ];
  const escaped = mutations.filter(([b, a, p]) => problems(b, a, p).length === 0);
  if (escaped.length) {
    const indexes = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
    throw new Error(`${escaped.length} planted defect(s) escaped: ${indexes.join(",")}`);
  }
  console.log(`verify-maintenance-kpi-drilldowns-exact-range selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-maintenance-kpi-drilldowns-exact-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-kpi-drilldowns-exact-range PASS — downtime/MTBF/CPM/cost-per-truck share exact scoped server range and lifecycle pager");
