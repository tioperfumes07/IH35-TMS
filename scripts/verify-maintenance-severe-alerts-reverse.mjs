#!/usr/bin/env node
/** Severe-alert endpoint and band: live response, exact range, canonical reverse drills. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  home: fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "utf8"),
  band: fs.readFileSync("apps/frontend/src/pages/maintenance/components/SevereAlertsBand.tsx", "utf8"),
};

function failures(source = live) {
  return [
    ["backend empty response shape", source.route.includes('return { alerts: [], total_count: 0, total_estimated_cost_all: 0 }')],
    ["backend returns defined result", /return \{[\s\S]{0,180}?alerts: res\.rows,[\s\S]{0,180}?total_count: Number\(res\.rows\[0\]\?\.total_count \?\? 0\),[\s\S]{0,180}?total_estimated_cost_all: Number\(costRes\.rows\[0\]\?\.total_estimated_cost_all \?\? 0\),[\s\S]{0,40}?\};/.test(source.route) && source.route.includes("return result")],
    ["backend exact total", source.route.includes("COUNT(*) OVER()::int AS total_count")],
    ["backend unbounded exposure total", /SELECT COALESCE\(SUM\(w\.total_actual_cost\), 0\)::numeric AS total_estimated_cost_all[\s\S]{0,700}?WHERE w\.operating_company_id = \$1::uuid[\s\S]{0,350}?w\.severity = 'severe'[\s\S]{0,180}?waiting_parts/.test(source.route)],
    ["typed API totals", /alerts: Array<Record<string, unknown>>;[\s\S]{0,100}?total_count: number;[\s\S]{0,220}?total_estimated_cost_all: number;/.test(source.api)],
    ["home forwards total", source.home.includes("<SevereAlertsBand") && source.home.includes("totalCount={severeAlertsQuery.data?.total_count")],
    ["home forwards all-row exposure", source.home.includes("totalEstimatedCostAll={severeAlertsQuery.data?.total_estimated_cost_all}")],
    ["range visible", source.band.includes('data-testid="severe-alerts-range"') && source.band.includes("Showing {alerts.length} of {totalCount} severe alerts")],
    ["unit reverse drill", source.band.includes('kind="unit" id={typeof alert.unit_id === "string" ? alert.unit_id : null} name={alert.unit_display_id}')],
    ["work-order reverse drill", source.band.includes('kind="work_order" id={typeof alert.id === "string" ? alert.id : null} name={alert.wo_display_id}')],
    ["aggregate distinguishes all vs visible", source.band.includes('data-testid="severe-alerts-total-all"') && source.band.includes("Total exposure (all {totalCount})") && source.band.includes("Visible subtotal ({alerts.length} shown)")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replace('return { alerts: [], total_count: 0, total_estimated_cost_all: 0 }', 'return { rows: [], total_count: 0, total_estimated_cost_all: 0 }') },
    { ...live, route: live.route.replace("alerts: res.rows,", "alerts: [],") },
    { ...live, route: live.route.replaceAll("COUNT(*) OVER()::int AS total_count", "50 AS hidden_count") },
    { ...live, route: live.route.replace("SELECT COALESCE(SUM(w.total_actual_cost), 0)::numeric AS total_estimated_cost_all", "SELECT 0::numeric AS total_estimated_cost_all") },
    { ...live, api: live.api.replace("total_estimated_cost_all: number;", "") },
    { ...live, home: live.home.replace("totalCount={severeAlertsQuery.data?.total_count", "totalCount={severeAlertsQuery.data?.alerts.length") },
    { ...live, home: live.home.replace("totalEstimatedCostAll={severeAlertsQuery.data?.total_estimated_cost_all}", "") },
    { ...live, band: live.band.replace('data-testid="severe-alerts-range"', 'data-testid="missing"') },
    { ...live, band: live.band.replace('kind="unit"', 'kind="driver"') },
    { ...live, band: live.band.replace('kind="work_order"', 'kind="load"') },
    { ...live, band: live.band.replace('data-testid="severe-alerts-total-all"', 'data-testid="missing-total"') },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-maintenance-severe-alerts-reverse SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log(`verify-maintenance-severe-alerts-reverse SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-maintenance-severe-alerts-reverse FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-severe-alerts-reverse PASS — endpoint, exact range, and unit/WO drills are wired");
