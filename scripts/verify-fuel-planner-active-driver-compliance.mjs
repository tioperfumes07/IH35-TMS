#!/usr/bin/env node
/**
 * Fuel planner active-driver compliance binding.
 * ROUND 443.250 — also asserts Compliance V3 KPI strip + V3Panel (chrome only).
 */
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
  // BANK-F91358 leftover refuse — CompliancePanel page-scoped text token ratchet
  if (source.panel.includes("text-[11px]")) failures.push("CompliancePanel.tsx: leftover text-[11px]");
  if (source.panel.includes("#8A92AB")) failures.push("CompliancePanel.tsx: leftover off-scale muted #8A92AB");
  // ROUND 443.250 Compliance V3 chrome
  if (!source.panel.includes("data-fuel-compliance-v3-kpis") || !source.panel.includes("V3KpiTile")) {
    failures.push("CompliancePanel: ROUND 443.250 must ship V3KpiTile strip (data-fuel-compliance-v3-kpis)");
  }
  if (!source.panel.includes("fuel-compliance-v3-panel") || !source.panel.includes("V3Panel")) {
    failures.push("CompliancePanel: ROUND 443.250 must wrap detail in V3Panel (fuel-compliance-v3-panel)");
  }
  if (!source.panel.includes("Fleet followed YTD") || !source.panel.includes("Driver followed YTD")) {
    failures.push("CompliancePanel: V3 KPI strip must include Fleet followed YTD + Driver followed YTD");
  }
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
    // BANK-F91358 leftover plant
    { ...files, panel: files.panel + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n' },
    // ROUND 443.250 V3 plants
    { ...files, panel: files.panel.replace(/data-fuel-compliance-v3-kpis/g, "data-fuel-compliance-gone") },
    { ...files, panel: files.panel.replace(/fuel-compliance-v3-panel/g, "fuel-compliance-gone-panel") },
  ];
  const caught = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (caught !== mutations.length) { console.error(`selftest caught ${caught}/${mutations.length}`); process.exit(1); }
  console.log(`PASS selftest: ${caught}/${mutations.length} planted regressions caught`);
} else {
  console.log("PASS: fuel planner driver compliance is bound to the active route driver FK");
}
