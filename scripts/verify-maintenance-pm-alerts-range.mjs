#!/usr/bin/env node
/** PM-alert reverse panels must disclose their exact state-filtered capped ranges. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/pm-alerts.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  card: fs.readFileSync("apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx", "utf8"),
};

function failures(source = live) {
  return [
    ["backend exact state total", source.route.includes("COUNT(*) OVER()::int AS total_count") && source.route.includes("total_count: Number(res.rows[0]?.total_count ?? 0)")],
    ["missing relation shape", source.route.includes("return { alerts: [], total_count: 0 }")],
    ["typed API total", source.api.includes("alerts: MaintenancePmAlert[]; total_count: number")],
    ["open total consumed", source.card.includes("alertsQuery.data?.total_count ?? alerts.length")],
    ["scheduled total consumed", source.card.includes("scheduledAlertsQuery.data?.total_count ?? scheduledAlerts.length")],
    ["compact range visible", source.card.includes('data-testid="pm-alerts-compact-range"') && source.card.includes("Showing {alerts.length} of {openTotalCount} open alerts")],
    ["full ranges visible", source.card.includes('data-testid="pm-alerts-open-range"') && source.card.includes('data-testid="pm-alerts-scheduled-range"')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replace("COUNT(*) OVER()::int AS total_count", "100 AS hidden_count") },
    { ...live, route: live.route.replace("return { alerts: [], total_count: 0 }", "return []") },
    { ...live, api: live.api.replace("; total_count: number", "") },
    { ...live, card: live.card.replace("alertsQuery.data?.total_count ?? alerts.length", "alerts.length") },
    { ...live, card: live.card.replace("scheduledAlertsQuery.data?.total_count ?? scheduledAlerts.length", "scheduledAlerts.length") },
    { ...live, card: live.card.replace('data-testid="pm-alerts-compact-range"', 'data-testid="missing"') },
    { ...live, card: live.card.replace('data-testid="pm-alerts-open-range"', 'data-testid="missing"').replace('data-testid="pm-alerts-scheduled-range"', 'data-testid="missing"') },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-maintenance-pm-alerts-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-maintenance-pm-alerts-range SELFTEST PASS — 7/7 mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-maintenance-pm-alerts-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-pm-alerts-range PASS — open and scheduled PM alerts expose exact totals");
