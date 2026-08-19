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
    ["backend empty response shape", source.route.includes('return { alerts: [], total_count: 0 }')],
    ["backend returns defined result", source.route.includes("return { alerts: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0) }") && source.route.includes("return result")],
    ["backend exact total", source.route.includes("COUNT(*) OVER()::int AS total_count")],
    ["typed API total", source.api.includes("alerts: Array<Record<string, unknown>>; total_count: number")],
    ["home forwards total", source.home.includes("<SevereAlertsBand") && source.home.includes("totalCount={severeAlertsQuery.data?.total_count")],
    ["range visible", source.band.includes('data-testid="severe-alerts-range"') && source.band.includes("Showing {alerts.length} of {totalCount} severe alerts")],
    ["unit reverse drill", source.band.includes('kind="unit" id={typeof alert.unit_id === "string" ? alert.unit_id : null} name={alert.unit_display_id}')],
    ["work-order reverse drill", source.band.includes('kind="work_order" id={typeof alert.id === "string" ? alert.id : null} name={alert.wo_display_id}')],
    ["aggregate labeled visible", source.band.includes("Visible total: ${total.toLocaleString()}")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replace('return { alerts: [], total_count: 0 }', 'return { rows: [], total_count: 0 }') },
    { ...live, route: live.route.replace("return { alerts: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0) }", "return res.rows") },
    { ...live, route: live.route.replaceAll("COUNT(*) OVER()::int AS total_count", "50 AS hidden_count") },
    { ...live, api: live.api.replace("alerts: Array<Record<string, unknown>>; total_count: number", "alerts: Array<Record<string, unknown>>") },
    { ...live, home: live.home.replace("totalCount={severeAlertsQuery.data?.total_count", "totalCount={severeAlertsQuery.data?.alerts.length") },
    { ...live, band: live.band.replace('data-testid="severe-alerts-range"', 'data-testid="missing"') },
    { ...live, band: live.band.replace('kind="unit"', 'kind="driver"') },
    { ...live, band: live.band.replace('kind="work_order"', 'kind="load"') },
    { ...live, band: live.band.replace("Visible total:", "Total:") },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-maintenance-severe-alerts-reverse SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-maintenance-severe-alerts-reverse SELFTEST PASS — 9/9 mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-maintenance-severe-alerts-reverse FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-severe-alerts-reverse PASS — endpoint, exact range, and unit/WO drills are wired");
