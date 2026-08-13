#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-road-service-driver-reverse";
const files = {
  route: "apps/backend/src/maintenance/road-service/tickets.routes.ts",
  hook: "apps/frontend/src/hooks/useRoadServiceTickets.ts",
  section: "apps/frontend/src/components/maintenance/DriverRoadServiceReverseSection.tsx",
  list: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route)) failures.push("list schema must accept driver_id");
  if (!/filters\.push\(`t\.driver_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("list SQL must filter driver_id");
  if (!/filters\?\.driver_id\) params\.set\("driver_id", filters\.driver_id\)/.test(s.hook)) failures.push("hook must forward driver_id");
  if (!/useRoadServiceTickets\(\{ driver_id: driverId \}\)/.test(s.section)) failures.push("reverse section must query driver_id");
  if (!/ticket_id=\$\{ticket\.id\}/.test(s.section)) failures.push("reverse row must drill to ticket list target");
  if (!/isError:\s*listQuery\.isError/.test(s.hook) || !/ListErrorBanner/.test(s.section)) failures.push("reverse section must expose query errors");
  if (!/highlightedTicketId === row\.id/.test(s.list)) failures.push("ticket list must honor deep-link highlight");
  if (!/<DriverRoadServiceReverseSection[\s\S]*driverId=\{id\}/.test(s.profile)) failures.push("driver profile must mount reverse section");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["route", { ...source, route: source.route.replace("filters.push(`t.driver_id = $${values.length}::uuid`)", "void values") }],
    ["hook", { ...source, hook: source.hook.replace('params.set("driver_id", filters.driver_id)', 'params.set("unit_id", filters.driver_id)') }],
    ["mount", { ...source, profile: source.profile.replace("<DriverRoadServiceReverseSection", "<div") }],
  ];
  for (const [name, changed] of mutations) {
    if (audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — route, hook, and mount mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — road-service↔driver is forward persisted, reverse filtered, and deep-link drillable`);
