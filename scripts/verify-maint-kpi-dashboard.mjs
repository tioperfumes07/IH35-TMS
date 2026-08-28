#!/usr/bin/env node
/**
 * Block B35: Maintenance KPI dashboard (MTBF, downtime, CPM, PM compliance).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const dashboard = read("apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx");
const KPI_ROUTES = "apps/backend/src/maintenance/kpi.routes.ts";
const kpiRoutes = read(KPI_ROUTES);

function fleetScopeFailures(source) {
  const failures = [];
  const oosQuery = source.match(/AS oos_hours[\s\S]{0,500}?FROM mdata\.units u[\s\S]{0,500}?u\.oos_since::date <= \$3::date/)?.[0] ?? "";
  const activeCounter = source.match(/async function countActiveUnits[\s\S]{0,700}?return Number\(res\.rows\[0\]\?\.c \?\? 1\);/)?.[0] ?? "";
  for (const [name, query] of [["OOS downtime", oosQuery], ["MTBF active-unit denominator", activeCounter]]) {
    if (!query.includes("owner_company_id = $1::uuid") || !query.includes("currently_leased_to_company_id = $1::uuid")) {
      failures.push(`${KPI_ROUTES}: ${name} must use the canonical owner-or-currently-leased fleet scope`);
    }
  }
  return failures;
}

function dashboardHonestyFailures(source) {
  const failures = [];
  if (!source.includes("const summary = summaryQ.isError ? undefined : summaryQ.data;")) failures.push("summary error must suppress retained KPI data");
  if (!/summaryQ\.isError \? \([\s\S]*title="Couldn't load maintenance KPI summary"[\s\S]*onRetry=\{\(\) => void summaryQ\.refetch\(\)\}[\s\S]*\) : \([\s\S]*tiles\.map/.test(source)) failures.push("all five summary tiles need one retryable fail-closed boundary");
  return failures;
}

function fail(msg) {
  console.error(`verify:maint-kpi-dashboard FAIL: ${msg}`);
  process.exit(1);
}

const failures = [];
failures.push(...fleetScopeFailures(kpiRoutes));
failures.push(...dashboardHonestyFailures(dashboard));
const checks = [
  ["kpi routes file", fs.existsSync("apps/backend/src/maintenance/kpi.routes.ts")],
  ["summary endpoint", read("apps/backend/src/maintenance/kpi.routes.ts").includes('app.get("/api/v1/maintenance/kpi/summary"')],
  ["downtime endpoint", read("apps/backend/src/maintenance/kpi.routes.ts").includes('app.get("/api/v1/maintenance/kpi/downtime"')],
  ["mtbf endpoint", read("apps/backend/src/maintenance/kpi.routes.ts").includes('app.get("/api/v1/maintenance/kpi/mtbf"')],
  ["cpm endpoint", read("apps/backend/src/maintenance/kpi.routes.ts").includes('app.get("/api/v1/maintenance/kpi/cpm"')],
  ["cost-per-truck endpoint", read("apps/backend/src/maintenance/kpi.routes.ts").includes('app.get("/api/v1/maintenance/kpi/cost-per-truck"')],
  ["pm-compliance endpoint", read("apps/backend/src/maintenance/kpi.routes.ts").includes('app.get("/api/v1/maintenance/kpi/pm-compliance"')],
  ["computeMtbfHours", read("apps/backend/src/maintenance/kpi.routes.ts").includes("computeMtbfHours")],
  ["5 backend tests", (read("apps/backend/src/maintenance/__tests__/kpi.routes.test.ts").match(/\bit\(/g) ?? []).length >= 5],
  ["dashboard page", dashboard.includes('data-testid="maint-kpi-dashboard"')],
  ["sparkline tiles", dashboard.includes("MiniSparkline")],
  ["date filters", dashboard.includes("maint-kpi-filter-start")],
  ["searchable unit picker", /<EntityPicker[\s\S]*?kind="unit"[\s\S]*?allowCreate=\{false\}[\s\S]*?dataTestId="maint-kpi-filter-unit"/.test(dashboard)],
  ["no native UUID unit select", !/<select[\s\S]*?value=\{unitId\}/.test(dashboard)],
  ["pm hub", dashboard.includes("maint-kpi-pm-hub")],
  ["retryable drilldown error", /drilldownQ\.isError[\s\S]*?<ListErrorState[\s\S]*?drilldownQ\.refetch\(\)/.test(dashboard)],
  ["3 frontend tests", (read("apps/frontend/src/pages/maintenance/__tests__/MaintKpiDashboardPage.test.tsx").match(/\bit\(/g) ?? []).length >= 3],
  ["manifest route", read("apps/frontend/src/routes/manifest.tsx").includes('path="/maintenance/kpi-dashboard"')],
  ["api helpers", read("apps/frontend/src/api/maintenance.ts").includes("getMaintenanceKpiSummary")],
  ["index register", read("apps/backend/src/index.ts").includes("registerMaintenanceKpiRoutes")],
  ["0364 unused", !fs.existsSync("db/migrations/0364_maint_kpi.sql")],
  ["report cross-link", dashboard.includes("/reports/maintenance-cost-per-unit")],
  ["arch design", read("docs/specs/IH35_ARCHITECTURAL_DESIGN.md").includes("verify:maint-kpi-dashboard")],
];

for (const [name, ok] of checks) if (!ok) failures.push(name);

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["OOS leased scope", kpiRoutes.replace("WHERE (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)", "WHERE u.owner_company_id = $1::uuid")],
    ["active-unit leased scope", kpiRoutes.replace("WHERE (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)", "WHERE owner_company_id = $1::uuid")],
  ];
  for (const [name, mutated] of mutations) {
    if (mutated === kpiRoutes || fleetScopeFailures(mutated).length === 0) {
      console.error(`verify:maint-kpi-dashboard SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
  }
  const dashboardMutations = [
    ["retained summary", dashboard.replace("const summary = summaryQ.isError ? undefined : summaryQ.data;", "const summary = summaryQ.data;")],
    ["summary error boundary", dashboard.replace("{summaryQ.isError ? (", "{false ? (")],
  ];
  for (const [name, mutated] of dashboardMutations) {
    if (mutated === dashboard || dashboardHonestyFailures(mutated).length === 0) {
      console.error(`verify:maint-kpi-dashboard SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`verify:maint-kpi-dashboard SELFTEST PASS — ${mutations.length + dashboardMutations.length} mutations detected`);
  process.exit(0);
}

if (failures.length) {
  for (const f of failures) console.error(" -", f);
  fail(failures.join("; "));
}
console.log("verify:maint-kpi-dashboard PASS");
