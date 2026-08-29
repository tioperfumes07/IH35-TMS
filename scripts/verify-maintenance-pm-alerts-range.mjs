#!/usr/bin/env node
// @matrix-built {"modules":["maintenance"],"cols":["connectivity","reverse_link"],"leaves":["maintenance.panel.pm_alerts"],"task":"MAINTENANCE-PM-ALERTS-READ-FAILURE-TRUTH"}
/** PM-alert panels must navigate their complete exact state-filtered ranges. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/pm-alerts.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  card: fs.readFileSync("apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx", "utf8"),
};

// RE-ANCHOR (found stale 2026-08-29): "range: { limit?: number; offset?: number }" is a literal
// substring shared by 8 different function signatures in maintenance.ts (getMaintenanceKpiDrilldown,
// getMaintenanceKpiPmCompliance, listMaintenancePmAlerts, getMaintenanceRmStatus, etc). The check was
// a whole-file .includes() so mutating any ONE occurrence (the selftest's bare non-global .replace()
// always hit the FIRST, unrelated occurrence at getMaintenanceKpiDrilldown) left the other 7 intact
// and the check kept passing -- the planted defect escaped. Scope both the check and the mutation to
// listMaintenancePmAlerts's own function body via its unique `export function listMaintenancePmAlerts(`
// anchor through the next `export function`, so only that function's real signature is asserted.
function pmAlertsListFn(apiSrc) {
  const start = apiSrc.indexOf("export function listMaintenancePmAlerts(");
  if (start === -1) return "";
  const next = apiSrc.indexOf("export function ", start + 1);
  return apiSrc.slice(start, next === -1 ? undefined : next);
}

function failures(source = live) {
  const pmAlertsFn = pmAlertsListFn(source.api);
  return [
    ["backend validated range", /limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,100}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(source.route)],
    ["backend exact state total", source.route.includes("SELECT COUNT(*)::int AS total_count") && source.route.includes("total_count: Number(count.rows[0]?.total_count ?? 0)")],
    ["backend parameterized range", source.route.includes("LIMIT $${limitParameter}") && source.route.includes("OFFSET $${offsetParameter}")],
    ["backend rate limited", source.route.includes('app.get("/api/v1/maintenance/pm-alerts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }')],
    ["missing relation shape", source.route.includes("return { alerts: [], total_count: 0 }")],
    ["typed API total and range", pmAlertsFn.includes("alerts: MaintenancePmAlert[]; total_count: number") && pmAlertsFn.includes("range: { limit?: number; offset?: number }")],
    ["open total consumed", source.card.includes("alertsQuery.data?.total_count ?? alerts.length")],
    ["scheduled total consumed", source.card.includes("scheduledAlertsQuery.data?.total_count ?? scheduledAlerts.length")],
    ["open server range", source.card.includes("offset: (openPage - 1) * pageSize") && source.card.includes('data-testid="pm-alerts-open-pager"')],
    ["compact server range", source.card.includes('data-testid="pm-alerts-compact-pager"')],
    ["scheduled server range", source.card.includes("offset: (scheduledPage - 1) * pageSize") && source.card.includes('data-testid="pm-alerts-scheduled-pager"')],
    ["open read failure visible", source.card.includes('data-testid="pm-alerts-query-error"') && source.card.includes("Couldn't load PM alerts") && source.card.includes("alertsQuery.refetch()")],
    ["scheduled read failure visible", source.card.includes('data-testid="pm-alerts-scheduled-query-error"') && source.card.includes("Couldn't load scheduled PM alerts") && source.card.includes("scheduledAlertsQuery.refetch()")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replace("max(200).default(50)", "max(100).default(100)") },
    { ...live, route: live.route.replace("SELECT COUNT(*)::int AS total_count", "SELECT 100::int AS hidden_count") },
    { ...live, route: live.route.replace("LIMIT $${limitParameter}", "LIMIT 100") },
    { ...live, route: live.route.replace('{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }', "") },
    { ...live, route: live.route.replace("return { alerts: [], total_count: 0 }", "return []") },
    {
      ...live,
      api: (() => {
        const fn = pmAlertsListFn(live.api);
        if (!fn) return live.api;
        const mutated = fn.replace("range: { limit?: number; offset?: number }", "range: Record<string, never>");
        return mutated === fn ? live.api : live.api.replace(fn, mutated);
      })(),
    },
    { ...live, card: live.card.replace("alertsQuery.data?.total_count ?? alerts.length", "alerts.length") },
    { ...live, card: live.card.replace("scheduledAlertsQuery.data?.total_count ?? scheduledAlerts.length", "scheduledAlerts.length") },
    { ...live, card: live.card.replace("offset: (openPage - 1) * pageSize", "offset: 0") },
    { ...live, card: live.card.replace('data-testid="pm-alerts-compact-pager"', 'data-testid="missing"') },
    { ...live, card: live.card.replace("offset: (scheduledPage - 1) * pageSize", "offset: 0") },
    { ...live, card: live.card.replace('data-testid="pm-alerts-query-error"', 'data-testid="missing"') },
    { ...live, card: live.card.replace('data-testid="pm-alerts-scheduled-query-error"', 'data-testid="missing"') },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-maintenance-pm-alerts-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log(`verify-maintenance-pm-alerts-range SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-maintenance-pm-alerts-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-pm-alerts-range PASS — compact, open, and scheduled PM alerts navigate exact retryable server ranges");
