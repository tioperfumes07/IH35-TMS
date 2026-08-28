#!/usr/bin/env node
/** Maintenance in-transit reverse queue must disclose its exact capped range. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  home: fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "utf8"),
  table: fs.readFileSync("apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx", "utf8"),
  band: fs.readFileSync("apps/frontend/src/pages/maintenance/components/InTransitTriageBand.tsx", "utf8"),
};

function failures(source = live) {
  return [
    ["backend exact total", source.route.includes("SELECT COUNT(*)::int AS total_count") && source.route.includes("issues: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0)")],
    ["empty/fixture response shape", source.route.includes("return { issues: [], total_count: 0 }") && source.route.includes("return { issues, total_count: issues.length }")],
    ["typed API total", source.api.includes("issues: InTransitIssue[]; total_count: number")],
    ["home forwards table total", source.home.includes("<InTransitIssuesTable") && source.home.includes("totalCount={triageTableQuery.data?.total_count")],
    ["home forwards band total", source.home.includes("<InTransitTriageBand") && source.home.includes("totalCount={triageQuery.data?.total_count")],
    ["table exact range", source.table.includes('data-testid="in-transit-issues-range"') && source.table.includes("Showing {issues.length} of {totalCount} in-transit issues")],
    ["band exact range", source.band.includes('data-testid="in-transit-triage-band-range"') && source.band.includes("Showing {issues.length} of {totalCount} issues")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replaceAll("SELECT COUNT(*)::int AS total_count", "SELECT 50 AS hidden_count") },
    { ...live, route: live.route.replaceAll("return { issues: [], total_count: 0 }", "return []") },
    { ...live, api: live.api.replace("issues: InTransitIssue[]; total_count: number", "issues: InTransitIssue[]") },
    { ...live, home: live.home.replace("totalCount={triageTableQuery.data?.total_count", "totalCount={triageTableQuery.data?.issues.length") },
    { ...live, home: live.home.replace("totalCount={triageQuery.data?.total_count", "totalCount={triageQuery.data?.issues.length") },
    { ...live, table: live.table.replace('data-testid="in-transit-issues-range"', 'data-testid="missing"') },
    { ...live, band: live.band.replace('data-testid="in-transit-triage-band-range"', 'data-testid="missing"') },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-maintenance-triage-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log(`verify-maintenance-triage-range SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-maintenance-triage-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-triage-range PASS — table and triage band expose exact in-transit totals");
