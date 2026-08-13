#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-road-service-driver-reverse";
const files = {
  route: "apps/backend/src/maintenance/road-service/tickets.routes.ts",
  hook: "apps/frontend/src/hooks/useRoadServiceTickets.ts",
  section: "apps/frontend/src/components/maintenance/RoadServiceReverseSection.tsx",
  list: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
  driverProfile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  unitProfile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route)) failures.push("list schema must accept driver_id");
  if (!/filters\.push\(`t\.driver_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("list SQL must filter driver_id");
  if (!/filters\?\.driver_id\) params\.set\("driver_id", filters\.driver_id\)/.test(s.hook)) failures.push("hook must forward driver_id");
  if (!/filters\?\.unit_id\) params\.set\("unit_id", filters\.unit_id\)/.test(s.hook)) failures.push("hook must forward unit_id");
  if (!/filters\.push\(`t\.unit_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("list SQL must filter unit_id");
  if (!/useRoadServiceTickets\(filter\)/.test(s.section)) failures.push("shared reverse section must query its canonical filter");
  if (!/ticket_id=\$\{ticket\.id\}/.test(s.section)) failures.push("reverse row must drill to ticket list target");
  if (!/isError:\s*listQuery\.isError/.test(s.hook) || !/ListErrorBanner/.test(s.section)) failures.push("reverse section must expose query errors");
  if (!/highlightedTicketId === row\.id/.test(s.list)) failures.push("ticket list must honor deep-link highlight");
  if (!/<RoadServiceReverseSection[\s\S]*filter=\{\{ driver_id: id \}\}/.test(s.driverProfile)) failures.push("driver profile must mount reverse section");
  if (!/<RoadServiceReverseSection[\s\S]*filter=\{\{ unit_id: id \}\}/.test(s.unitProfile)) failures.push("unit profile must mount reverse section");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["route", { ...source, route: source.route.replace("filters.push(`t.driver_id = $${values.length}::uuid`)", "void values") }],
    ["hook", { ...source, hook: source.hook.replace('params.set("driver_id", filters.driver_id)', 'params.set("unit_id", filters.driver_id)') }],
    ["driver mount", { ...source, driverProfile: source.driverProfile.replace("<RoadServiceReverseSection", "<div") }],
    ["unit mount", { ...source, unitProfile: source.unitProfile.replace("<RoadServiceReverseSection", "<div") }],
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
console.log(`${LABEL} PASS — road-service↔driver/unit share filtered, deep-link drillable reverse wiring`);
