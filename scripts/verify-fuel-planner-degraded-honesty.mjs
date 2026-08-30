#!/usr/bin/env node
import fs from "node:fs";

const files = {
  page: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
  table: "apps/frontend/src/pages/fuel/components/StopReasoningTable.tsx",
  diagram: "apps/frontend/src/pages/fuel/components/RouteDiagramSvg.tsx",
  activeStrip: "apps/frontend/src/pages/fuel/components/ActiveTripStrip.tsx",
  summary: "apps/frontend/src/pages/fuel/components/TripPlanSummaryBanner.tsx",
  api: "apps/frontend/src/api/fuelPlanner.ts",
};

function scan(source) {
  const { page, table, diagram, activeStrip, summary, api } = source;
  return [
    ["planner aggregates API errors", /plannerError = dashboardQuery\.error \?\? activeRoutesQuery\.error \?\? settingsQuery\.error \?\? detailQuery\.error/.test(page)],
    ["degraded branch precedes planner data", /dashboardQuery\.isError \|\| activeRoutesQuery\.isError \|\| settingsQuery\.isError \|\| detailQuery\.isError \? \([\s\S]*?<ListErrorBanner/.test(page)],
    ["server failure is surfaced", /userFacingApiError\(plannerError/.test(page)],
    ["unavailable is not zero", page.includes("Planner values are unavailable — they are not zero.")],
    ["retry refetches planner sources", /dashboardQuery\.refetch\(\)[\s\S]*activeRoutesQuery\.refetch\(\)[\s\S]*settingsQuery\.refetch\(\)/.test(page)],
    ["stop table does not fabricate mile zero", table.includes('stop.mile_marker == null ? "—"') && !table.includes("stop.mile_marker ?? 0")],
    ["stop table does not fabricate gallons zero", table.includes('gallons == null ? "—"') && !table.includes("row.gallons ?? 0")],
    ["diagram refuses to plot unknown mileage at origin", diagram.includes("if (stop.mile_marker == null) return []") && diagram.includes("need route-mile data before they can be plotted") && !diagram.includes("stop.mile_marker ?? 0")],
    ["diagram labels unknown gallons honestly", diagram.includes('(stop.gallons_added ?? stop.gallons) == null ? "—"')],
    ["route distance contract remains nullable", api.includes("total_distance_miles: number | null")],
    ["recommended gallons contract remains nullable", api.includes("recommended_total_fuel_gallons: number | null")],
    ["active trip strip does not fabricate route zero", activeStrip.includes("route?.total_distance_miles != null") && !activeStrip.includes("total_distance_miles ?? 0")],
    ["trip summary does not fabricate route zero", summary.includes("route?.total_distance_miles != null") && !summary.includes("total_distance_miles ?? 0")],
    ["trip summary does not fabricate gallons zero", summary.includes("route?.recommended_total_fuel_gallons != null") && !summary.includes('label="Gallons needed">{route ?')],
    ["route diagram requires authoritative route length", diagram.includes("if (totalMiles == null || totalMiles <= 0)") && diagram.includes("Route distance is unavailable") && !diagram.includes("Number(totalMiles || 1)")],
  ];
}

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const checks = scan(source);
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["mile-zero", { ...source, table: source.table.replace('stop.mile_marker == null ? "—" : Number(stop.mile_marker)', "Number(stop.mile_marker ?? 0)") }],
    ["gallons-zero", { ...source, table: source.table.replace('gallons == null ? "—" : Number(gallons)', "Number(gallons ?? 0)") }],
    ["plot-at-origin", { ...source, diagram: source.diagram.replace("if (stop.mile_marker == null) return [];", "") }],
    ["diagram-gallons-zero", { ...source, diagram: source.diagram.replace('(stop.gallons_added ?? stop.gallons) == null ? "—"', 'stop.gallons_added ?? stop.gallons ?? 0') }],
    ["distance-contract-required", { ...source, api: source.api.replace("total_distance_miles: number | null", "total_distance_miles: number") }],
    ["gallons-contract-required", { ...source, api: source.api.replace("recommended_total_fuel_gallons: number | null", "recommended_total_fuel_gallons: number") }],
    ["active-route-zero", { ...source, activeStrip: source.activeStrip.replace("route?.total_distance_miles != null", "route") + "\n// total_distance_miles ?? 0" }],
    ["summary-route-zero", { ...source, summary: source.summary.replace("route?.total_distance_miles != null", "route") + "\n// total_distance_miles ?? 0" }],
    ["summary-gallons-zero", { ...source, summary: source.summary.replace("route?.recommended_total_fuel_gallons != null", "route") + '\n// label="Gallons needed">{route ?' }],
    ["diagram-fake-denominator", { ...source, diagram: source.diagram.replace("if (totalMiles == null || totalMiles <= 0)", "if (false)") + "\n// Number(totalMiles || 1)" }],
  ];
  for (const [label, mutated] of mutations) {
    if (scan(mutated).every(([, ok]) => ok)) {
      console.error(`verify-fuel-planner-degraded-honesty selftest FAIL — ${label} escaped`);
      process.exit(1);
    }
  }
  console.log(`verify-fuel-planner-degraded-honesty selftest PASS (${mutations.length}/${mutations.length})`);
}
console.log(`verify-fuel-planner-degraded-honesty: ${checks.length}/${checks.length} PASS`);
