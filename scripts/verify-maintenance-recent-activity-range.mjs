#!/usr/bin/env node
/** Maintenance recent/completed reverse lists must disclose their exact five-row ranges. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  home: fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "utf8"),
  row: fs.readFileSync("apps/frontend/src/pages/maintenance/components/RecentActivityRow.tsx", "utf8"),
};

function failures(source = live) {
  return [
    ["two exact backend totals", (source.route.match(/COUNT\(\*\) OVER\(\)::int AS total_count/g) ?? []).length >= 2 && source.route.includes("recent_total_count: Number(recent.rows[0]?.total_count ?? 0)") && source.route.includes("completed_total_count: Number(completed.rows[0]?.total_count ?? 0)")],
    ["empty response totals", source.route.includes("recent_total_count: 0, completed_total_count: 0")],
    ["typed client totals", source.api.includes("recent_total_count: number; completed_total_count: number")],
    ["home forwards recent total", source.home.includes("recentTotalCount={recentQuery.data?.recent_total_count")],
    ["home forwards completed total", source.home.includes("completedTotalCount={recentQuery.data?.completed_total_count")],
    ["shared table receives total", source.row.includes("totalCount: number") && source.row.includes("totalCount > rows.length")],
    ["visible exact range", source.row.includes('data-testid="maintenance-recent-activity-range"') && source.row.includes("{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount} work orders.")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replaceAll("COUNT(*) OVER()::int AS total_count", "5 AS hidden_count") },
    { ...live, route: live.route.replace("recent_total_count: 0, completed_total_count: 0", "") },
    { ...live, api: live.api.replace("recent_total_count: number; completed_total_count: number", "") },
    { ...live, home: live.home.replace("recentTotalCount={recentQuery.data?.recent_total_count", "recentTotalCount={recentQuery.data?.recent.length") },
    { ...live, home: live.home.replace("completedTotalCount={recentQuery.data?.completed_total_count", "completedTotalCount={recentQuery.data?.completed.length") },
    { ...live, row: live.row.replace("totalCount > rows.length", "false") },
    { ...live, row: live.row.replace('data-testid="maintenance-recent-activity-range"', 'data-testid="missing"') },
    { ...live, row: live.row.replace("{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount} work orders.", "Showing {rows.length} rows") },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-maintenance-recent-activity-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-maintenance-recent-activity-range SELFTEST PASS — 8/8 mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-maintenance-recent-activity-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-recent-activity-range PASS — recent and completed WO reverse lists expose exact totals");
