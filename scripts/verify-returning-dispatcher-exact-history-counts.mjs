#!/usr/bin/env node
/** @matrix-built {"modules":["users"],"cols":["connectivity","qbo_chrome"],"leaves":["create"],"task":"USR-F6927-RETURNING-DISPATCHER-SILENT-50-HISTORY","vertical":"leaf-complete"} */
import fs from "node:fs";
const ROUTE = "apps/backend/src/mdata/dispatcher-safety-events.routes.ts";
const API = "apps/frontend/src/api/identity.ts";
const USERS = "apps/frontend/src/pages/Users.tsx";
const read = (file) => fs.readFileSync(file, "utf8");

export function verify(sources = {}) {
  const route = sources.route ?? read(ROUTE);
  const api = sources.api ?? read(API);
  const users = sources.users ?? read(USERS);
  const finder = route.match(/async function findReturningDispatcherMatches[\s\S]*?\n}\n\nexport async function registerDispatcherSafetyEventsRoutes/)?.[0] ?? "";
  const checks = [
    ["latest evidence remains bounded", /ORDER BY e\.event_date DESC, e\.created_at DESC[\s\S]*?LIMIT 50/.test(finder)],
    ["exact total window", /COUNT\(\*\) OVER\(\)::int AS total_count/.test(finder)],
    ["exact severity windows", ["severe", "warning", "info"].every((severity) => finder.includes(`COUNT(*) FILTER (WHERE e.severity = '${severity}') OVER()::int AS ${severity}_count`))],
    ["response exposes total", /total_count: totalCount/.test(finder)],
    ["summary reads exact windows", /severe_count: Number\(countRow\?\.severe_count \?\? 0\)/.test(finder) && !/matchedEvents\.reduce/.test(finder)],
    ["typed client total", /ReturningDispatcherDetectionResult[\s\S]*?total_count: number/.test(api)],
    ["invite warning uses total", /returningDetection\.total_count} prior safety event/.test(users) && !/returningDetection\.matched_events\.length} prior safety event/.test(users)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = { route: read(ROUTE), api: read(API), users: read(USERS) };
  const mutations = [
    ["page-length total", { ...live, users: live.users.replace("returningDetection.total_count} prior safety event", "returningDetection.matched_events.length} prior safety event") }],
    ["dropped total window", { ...live, route: live.route.replace("COUNT(*) OVER()::int AS total_count", "50::int AS total_count") }],
    ["reduced bounded events", { ...live, route: live.route.replace("const countRow = res.rows[0];", "const countRow = null;\n  const severitySummaryFromEvents = matchedEvents.reduce(() => ({}), {});") }],
  ];
  for (const [name, sources] of mutations) if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
  console.log(`PASS: selftest caught ${mutations.length} returning-dispatcher count regressions`);
} else {
  const failures = verify();
  if (failures.length) { console.error(`FAIL: ${failures.join("; ")}`); process.exit(1); }
  console.log("PASS: returning-dispatcher onboarding uses exact full-history counts with bounded evidence");
}
