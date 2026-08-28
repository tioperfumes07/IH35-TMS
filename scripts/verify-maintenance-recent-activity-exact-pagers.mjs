#!/usr/bin/env node
// MAINT-F6941 — both recent WO histories need independent exact server paging.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const live = () => ({
  backend: read("apps/backend/src/maintenance/dashboard.routes.ts"),
  api: read("apps/frontend/src/api/maintenance.ts"),
  page: read("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx"),
  row: read("apps/frontend/src/pages/maintenance/components/RecentActivityRow.tsx"),
});
export function check(s) {
  const failures = [];
  const start = s.backend.indexOf('app.get("/api/v1/maintenance/dashboard/recent-activity"');
  const end = s.backend.indexOf("\n  app.get(", start + 10);
  const route = start >= 0 ? s.backend.slice(start, end >= 0 ? end : undefined) : "";
  if ((route.match(/LIMIT \$2 OFFSET \$3/g) ?? []).length !== 2) failures.push("both WO histories must page in SQL");
  if (/LIMIT 5/.test(route)) failures.push("fixed five-row cap remains");
  if (!/recent_offset[\s\S]*?completed_offset/.test(s.api)) failures.push("API must carry independent offsets");
  if (!/recentWoPage, completedWoPage/.test(s.page) || !/recent_offset: recentWoPage \* activityPageSize/.test(s.page)) failures.push("page query must identify both histories");
  if (!/completed_offset: completedWoPage \* activityPageSize/.test(s.page)) failures.push("completed offset missing");
  if ((s.row.match(/onPageChange=/g) ?? []).length !== 2) failures.push("both mounted history cards need navigation");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const s = live();
  const start = s.backend.indexOf('app.get("/api/v1/maintenance/dashboard/recent-activity"');
  const mutations = [
    { ...s, backend: s.backend.slice(0, start) + s.backend.slice(start).replace("LIMIT $2 OFFSET $3", "LIMIT 5") },
    { ...s, page: s.page.replace("recentWoPage, completedWoPage", "recentWoPage") },
    { ...s, page: s.page.replace("completed_offset: completedWoPage * activityPageSize", "completed_offset: 0") },
    { ...s, row: s.row.replace("onPageChange={onCompletedPageChange}", "onPageChange={onRecentPageChange}").replace("onPageChange={onRecentPageChange}", "") },
  ];
  if (check(s).length || mutations.some((m) => check(m).length === 0)) process.exit(1);
  console.log("verify-maintenance-recent-activity-exact-pagers: selftest PASS (4/4 mutations killed)");
  process.exit(0);
}
const failures = check(live());
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("verify-maintenance-recent-activity-exact-pagers: PASS");

