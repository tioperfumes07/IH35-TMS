#!/usr/bin/env node
// MAINT-F6940 — both DTC auto-WO card mounts must reach every exact scoped row.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  backend: "apps/backend/src/maintenance/dashboard.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  card: "apps/frontend/src/pages/maintenance/components/DtcAutoWorkOrdersCard.tsx",
};

export function check(s) {
  const failures = [];
  const routeStart = s.backend.indexOf('app.get("/api/v1/maintenance/dashboard/dtc-auto-work-orders"');
  const routeEnd = s.backend.indexOf("\n  app.get(", routeStart + 10);
  const route = routeStart >= 0 ? s.backend.slice(routeStart, routeEnd >= 0 ? routeEnd : undefined) : "";
  if (!/limit:[\s\S]*?offset:[\s\S]*?LIMIT \$2 OFFSET \$3/.test(route)) failures.push("backend must page exact DTC rows");
  if (/LIMIT 50/.test(route)) failures.push("silent backend cap remains");
  if (!/getMaintenanceDtcAutoWorkOrders\(companyId: string, range:[\s\S]*?params\.set\("offset"/.test(s.api)) failures.push("API must carry range");
  if (!/queryKey: \["maintenance", "dtc-auto-wos", operatingCompanyId, page\]/.test(s.card)) failures.push("page missing from query identity");
  if (!/offset: page \* pageSize/.test(s.card)) failures.push("card must request selected page");
  if (/rows\.slice\(0, 10\)/.test(s.card)) failures.push("client slice still hides server rows");
  if ((s.card.match(/pager\("dtc-auto-work-orders-/g) ?? []).length !== 2) failures.push("compact and full mounts both need pager");
  return failures;
}

const load = () => Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));
if (process.argv.includes("--selftest")) {
  const live = load();
  const dtcStart = live.backend.indexOf('app.get("/api/v1/maintenance/dashboard/dtc-auto-work-orders"');
  const backendWithoutPager = live.backend.slice(0, dtcStart) + live.backend.slice(dtcStart).replace("LIMIT $2 OFFSET $3", "LIMIT 50");
  const mutations = [
    { ...live, backend: backendWithoutPager },
    { ...live, card: live.card.replace(", page]", "]") },
    { ...live, card: live.card.replace("offset: page * pageSize", "offset: 0") },
    { ...live, card: live.card.replace("rows.map((row)", "rows.slice(0, 10).map((row)") },
  ];
  if (check(live).length || mutations.some((mutant) => check(mutant).length === 0)) process.exit(1);
  console.log("verify-maintenance-dtc-auto-wo-exact-pager: selftest PASS (4/4 mutations killed)");
  process.exit(0);
}
const failures = check(load());
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("verify-maintenance-dtc-auto-wo-exact-pager: PASS");
