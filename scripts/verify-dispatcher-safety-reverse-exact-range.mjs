#!/usr/bin/env node
/** @matrix-built {"modules":["customers","drivers","dispatch"],"cols":["connectivity","reverse_link"],"leaves":["detail.quality","profiles.drawer.safety_event","load.detail"],"task":"SAF-F6926-DISPATCHER-SAFETY-REVERSE-SILENT-200-CAP","vertical":"class-sweep"} */
import fs from "node:fs";
const ROUTE = "apps/backend/src/mdata/dispatcher-safety-events.routes.ts";
const API = "apps/frontend/src/api/identity.ts";
const VIEW = "apps/frontend/src/components/safety/DispatcherSafetyEventsReverseBlock.tsx";
const read = (file) => fs.readFileSync(file, "utf8");

export function verify(sources = {}) {
  const route = sources.route ?? read(ROUTE);
  const api = sources.api ?? read(API);
  const view = sources.view ?? read(VIEW);
  const reverseRoute = route.match(/app\.get\("\/api\/v1\/mdata\/dispatcher-safety-events"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const checks = [
    ["bounded range schema", /limit: z\.coerce\.number\(\).*max\(200\).*default\(25\)/s.test(route) && /offset: z\.coerce\.number\(\).*default\(0\)/s.test(route)],
    ["exact filtered total", /totals AS \(SELECT COUNT\(\*\)::int AS total_count FROM filtered\)/.test(reverseRoute)],
    ["stable server page", /ORDER BY event_date DESC, created_at DESC, id LIMIT \$3 OFFSET \$4/.test(reverseRoute)],
    ["no literal silent cap", !/LIMIT 200/.test(reverseRoute)],
    ["range response", /total_count: Number\(res\.rows\[0\]\?\.total_count \?\? 0\)/.test(reverseRoute)],
    ["client forwards range", /limit: String\(range\.limit\)/.test(api) && /offset: String\(range\.offset\)/.test(api)],
    ["mounted pager uses server total", /const totalCount =/.test(view) && /query\.data\?\.total_count/.test(view) && !/const totalCount[^;]*events\.length/.test(view) && /of \{totalCount\}/.test(view) && /setPage\(\(current\) => current \+ 1\)/.test(view)],
    ["all three reverse callers remain", ["LoadSafetyReverseSection", "DriverSafetyReverseSection", "CustomerDetail"].every((name) => fs.readFileSync(`apps/frontend/src/${name === "CustomerDetail" ? "pages/CustomerDetail.tsx" : `components/safety/${name}.tsx`}`, "utf8").includes("DispatcherSafetyEventsReverseBlock"))],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = { route: read(ROUTE), api: read(API), view: read(VIEW) };
  const mutations = [
    ["restored cap", { ...live, route: live.route.replace("ORDER BY event_date DESC, created_at DESC, id LIMIT $3 OFFSET $4", "ORDER BY event_date DESC, created_at DESC LIMIT 200") }],
    ["dropped total", { ...live, route: live.route.replace("COUNT(*)::int AS total_count", "0::int AS total_count") }],
    ["dropped offset", { ...live, api: live.api.replace("offset: String(range.offset)", "offset: '0'") }],
    ["local count theater", { ...live, view: live.view.replace("query.data?.total_count ?? 0", "events.length") }],
  ];
  for (const [name, sources] of mutations) if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
  console.log(`PASS: selftest caught ${mutations.length} dispatcher-safety reverse range regressions`);
} else {
  const failures = verify();
  if (failures.length) { console.error(`FAIL: ${failures.join("; ")}`); process.exit(1); }
  console.log("PASS: dispatcher-safety reverse links page exact ranges on load/customer/driver surfaces");
}
