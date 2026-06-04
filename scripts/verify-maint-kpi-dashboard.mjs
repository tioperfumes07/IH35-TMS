#!/usr/bin/env node
/**
 * Block B35: Maintenance KPI dashboard (MTBF, downtime, CPM, PM compliance).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function fail(msg) {
  console.error(`verify:maint-kpi-dashboard FAIL: ${msg}`);
  process.exit(1);
}

const failures = [];
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
  ["dashboard page", read("apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx").includes('data-testid="maint-kpi-dashboard"')],
  ["sparkline tiles", read("apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx").includes("MiniSparkline")],
  ["date filters", read("apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx").includes("maint-kpi-filter-start")],
  ["pm hub", read("apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx").includes("maint-kpi-pm-hub")],
  ["3 frontend tests", (read("apps/frontend/src/pages/maintenance/__tests__/MaintKpiDashboardPage.test.tsx").match(/\bit\(/g) ?? []).length >= 3],
  ["manifest route", read("apps/frontend/src/routes/manifest.tsx").includes('path="/maintenance/kpi-dashboard"')],
  ["api helpers", read("apps/frontend/src/api/maintenance.ts").includes("getMaintenanceKpiSummary")],
  ["index register", read("apps/backend/src/index.ts").includes("registerMaintenanceKpiRoutes")],
  ["0364 unused", !fs.existsSync("db/migrations/0364_maint_kpi.sql")],
  ["report cross-link", read("apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx").includes("/reports/maintenance-cost-per-unit")],
  ["arch design", read("docs/specs/IH35_ARCHITECTURAL_DESIGN.md").includes("verify:maint-kpi-dashboard")],
];

for (const [name, ok] of checks) if (!ok) failures.push(name);

if (failures.length) {
  for (const f of failures) console.error(" -", f);
  fail(failures.join("; "));
}
console.log("verify:maint-kpi-dashboard PASS");
