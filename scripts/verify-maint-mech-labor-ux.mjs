#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const failures = [];
const checks = [
  ["routes wo_time_entries", read("apps/backend/src/maintenance/labor.routes.ts").includes("maintenance.wo_time_entries")],
  ["labor codes catalog", read("apps/backend/src/maintenance/labor.routes.ts").includes("catalogs.maintenance_labor_codes")],
  ["labor-codes endpoint", read("apps/backend/src/maintenance/labor.routes.ts").includes('app.get("/api/v1/maintenance/labor-codes"')],
  ["computeLaborCostCents", read("apps/backend/src/maintenance/labor.routes.ts").includes("computeLaborCostCents")],
  ["archive sunset", read("apps/backend/src/maintenance/time-entries.routes.ts").includes("ARCHIVE-not-DELETE")],
  ["4 backend tests", (read("apps/backend/src/maintenance/__tests__/labor.routes.test.ts").match(/\bit\(/g) ?? []).length >= 4],
  ["tracker testid", read("apps/frontend/src/components/maintenance/LaborTracker.tsx").includes('data-testid="maint-labor-tracker"')],
  ["running timer", read("apps/frontend/src/components/maintenance/LaborTracker.tsx").includes('data-testid="maint-labor-running-timer"')],
  ["labor codes ui", read("apps/frontend/src/components/maintenance/LaborTracker.tsx").includes("listMaintenanceLaborCodes")],
  ["clock in", read("apps/frontend/src/components/maintenance/LaborTracker.tsx").includes("Clock in")],
  ["book labor", read("apps/frontend/src/components/maintenance/LaborTracker.tsx").includes("Book labor entry")],
  ["3 frontend tests", (read("apps/frontend/src/components/maintenance/__tests__/LaborTracker.test.tsx").match(/\bit\(/g) ?? []).length >= 3],
  ["wo detail mount", read("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx").includes("<LaborTracker")],
  ["api helper", read("apps/frontend/src/api/maintenance.ts").includes("listMaintenanceLaborCodes")],
  ["index register", read("apps/backend/src/index.ts").includes("registerMaintenanceLaborRoutes")],
  ["arch design", read("docs/specs/IH35_ARCHITECTURAL_DESIGN.md").includes("verify:maint-mech-labor-ux")],
];
for (const [name, ok] of checks) if (!ok) failures.push(name);
if (failures.length) {
  for (const f of failures) console.error(" -", f);
  console.error("verify:maint-mech-labor-ux FAIL:", failures.join("; "));
  process.exit(1);
}
console.log("verify:maint-mech-labor-ux PASS");
