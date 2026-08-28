#!/usr/bin/env node
import fs from "node:fs";

const files = {
  backend: fs.readFileSync("apps/backend/src/fuel/planner.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/fuelPlanner.ts", "utf8"),
  home: fs.readFileSync("apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", "utf8"),
  panel: fs.readFileSync("apps/frontend/src/pages/fuel/components/CompliancePanel.tsx", "utf8"),
};

function verify(source) {
  const failures = [];
  if (!source.backend.includes("const complianceSummaryQuerySchema") || !source.backend.includes("driver_id: z.string().uuid().optional()")) failures.push("backend exact-driver query schema missing");
  if (!source.backend.includes("($2::uuid IS NULL OR c.driver_id = $2::uuid)")) failures.push("backend company-scoped driver predicate missing");
  if (/ORDER BY c\.pct_followed[\s\S]{0,80}LIMIT 25/.test(source.backend)) failures.push("top-25 compliance cap remains");
  if (!source.api.includes('search.set("driver_id", driverId)')) failures.push("API client does not forward canonical driver FK");
  if (!source.home.includes('queryKey: ["fuel", "planner", "compliance", companyId, complianceDriverId]')) failures.push("compliance cache is not active-driver keyed");
  if (!source.home.includes("getFuelComplianceSummary(companyId, complianceDriverId)")) failures.push("active driver is not bound to compliance read");
  if (!source.home.includes("firstDriver ? Number(firstDriver.pct_followed ?? 0) : null")) failures.push("missing driver row still renders a false zero");
  if (!source.panel.includes('driverPct === null ? "Not available"')) failures.push("panel does not disclose unavailable driver compliance");
  return failures;
}

const failures = verify(files);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...files, backend: files.backend.replace("($2::uuid IS NULL OR c.driver_id = $2::uuid)", "TRUE") },
    { ...files, api: files.api.replace('search.set("driver_id", driverId)', 'search.set("driver", driverId)') },
    { ...files, home: files.home.replace("getFuelComplianceSummary(companyId, complianceDriverId)", "getFuelComplianceSummary(companyId)") },
    { ...files, panel: files.panel.replace('driverPct === null ? "Not available"', 'driverPct === null ? "0.0%"') },
  ];
  const caught = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (caught !== mutations.length) { console.error(`selftest caught ${caught}/${mutations.length}`); process.exit(1); }
  console.log(`PASS selftest: ${caught}/${mutations.length} planted regressions caught`);
} else {
  console.log("PASS: fuel planner driver compliance is bound to the active route driver FK");
}
