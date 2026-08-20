#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leafRe":"^road_service\\.active$","task":"ROAD-SERVICE-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leafRe":"^profiles\\.detail$","task":"ROAD-SERVICE-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\\.profile\\.maintenance$","task":"ROAD-SERVICE-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^detail\\.profile$","task":"ROAD-SERVICE-REVERSE-LEAVES","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-road-service-driver-reverse";
const files = {
  route: "apps/backend/src/maintenance/road-service/tickets.routes.ts",
  hook: "apps/frontend/src/hooks/useRoadServiceTickets.ts",
  section: "apps/frontend/src/components/maintenance/RoadServiceReverseSection.tsx",
  list: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
  driverProfile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  unitProfile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  vendorProfile: "apps/frontend/src/pages/VendorDetail.tsx",
  workOrderDetail: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route)) failures.push("list schema must accept driver_id");
  if (!/filters\.push\(`t\.driver_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("list SQL must filter driver_id");
  if (!/filters\?\.driver_id\) params\.set\("driver_id", filters\.driver_id\)/.test(s.hook)) failures.push("hook must forward driver_id");
  if (!/filters\?\.unit_id\) params\.set\("unit_id", filters\.unit_id\)/.test(s.hook)) failures.push("hook must forward unit_id");
  if (!/filters\.push\(`t\.unit_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("list SQL must filter unit_id");
  if (!/filters\.push\(`t\.vendor_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("list SQL must filter vendor_id");
  if (!/filters\?\.vendor_id\) params\.set\("vendor_id", filters\.vendor_id\)/.test(s.hook)) failures.push("hook must forward vendor_id");
  if (!/filters\.push\(`t\.wo_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("list SQL must filter wo_id");
  if (!/filters\?\.wo_id\) params\.set\("wo_id", filters\.wo_id\)/.test(s.hook)) failures.push("hook must forward wo_id");
  if (!/useRoadServiceTickets\(filter\)/.test(s.section)) failures.push("shared reverse section must query its canonical filter");
  if (!/kind=["']road_service_ticket["']/.test(s.section) || !/id=\{ticket\.id\}/.test(s.section)) failures.push("reverse row must drill to ticket list target");
  for (const [kind, id, name] of [
    ["unit", "unit_id", "unit_display_id"],
    ["vendor", "vendor_id", "vendor_name"],
    ["work_order", "wo_id", "work_order_display_id"],
    ["bill", "bill_id", "bill_number"],
  ]) {
    const drill = new RegExp(`kind=["']${kind}["'][^>]+id=\\{ticket\\.${id}\\}[^>]+name=\\{ticket\\.${name}\\}`);
    if (!drill.test(s.section)) failures.push(`reverse row must drill to related ${kind} with canonical id and label`);
  }
  if (!/b\.bill_number AS bill_number/.test(s.route) || !/b\.operating_company_id = \$1::uuid/.test(s.route)) {
    failures.push("bill label join must be entity-scoped");
  }
  if (!/bill_number\?: string \| null/.test(s.hook)) failures.push("ticket response type must expose bill label");
  if (!/isError:\s*listQuery\.isError/.test(s.hook) || !/ListErrorBanner/.test(s.section)) failures.push("reverse section must expose query errors");
  if (!/highlightedTicketId === row\.id/.test(s.list)) failures.push("ticket list must honor deep-link highlight");
  for (const kind of ["unit", "driver", "vendor"]) {
    if (!new RegExp(`<EntityLink(?:OrTombstone)?[^>]+kind=["']${kind}["']`).test(s.list)) failures.push(`ticket list must use canonical EntityLink kind=${kind}`);
  }
  if (!/AS vendor_ok/.test(s.route) || !/AS unit_ok/.test(s.route) || !/AS driver_ok/.test(s.route) ||
      !/linked_entity_not_in_operating_company/.test(s.route)) {
    failures.push("create writer must validate vendor, unit, and optional driver against the operating company before insert");
  }
  if (!/<RoadServiceReverseSection[\s\S]*filter=\{\{ driver_id: id \}\}/.test(s.driverProfile)) failures.push("driver profile must mount reverse section");
  if (!/<RoadServiceReverseSection[\s\S]*filter=\{\{ unit_id: id \}\}/.test(s.unitProfile)) failures.push("unit profile must mount reverse section");
  if (!/<RoadServiceReverseSection[\s\S]*filter=\{\{ vendor_id: vendor\.id \}\}/.test(s.vendorProfile)) failures.push("vendor profile must mount reverse section");
  if (!/<RoadServiceReverseSection[\s\S]*filter=\{\{ wo_id: id \}\}/.test(s.workOrderDetail)) failures.push("work-order detail must mount reverse section");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["route", { ...source, route: source.route.replace("filters.push(`t.driver_id = $${values.length}::uuid`)", "void values") }],
    ["hook", { ...source, hook: source.hook.replace('params.set("driver_id", filters.driver_id)', 'params.set("unit_id", filters.driver_id)') }],
    ["driver mount", { ...source, driverProfile: source.driverProfile.replace("<RoadServiceReverseSection", "<div") }],
    ["unit mount", { ...source, unitProfile: source.unitProfile.replace("<RoadServiceReverseSection", "<div") }],
    ["vendor mount", { ...source, vendorProfile: source.vendorProfile.replace("<RoadServiceReverseSection", "<div") }],
    ["work-order mount", { ...source, workOrderDetail: source.workOrderDetail.replace("<RoadServiceReverseSection", "<div") }],
    ["canonical unit drill", { ...source, list: source.list.replace(/kind="unit"/, 'kind="load"') }],
    ["writer unit membership", { ...source, route: source.route.replace(/AS unit_ok/, "AS asset_ok") }],
    ["reverse unit", { ...source, section: source.section.replace('kind="unit"', 'kind="load"') }],
    ["reverse vendor", { ...source, section: source.section.replace('kind="vendor"', 'kind="customer"') }],
    ["reverse work order", { ...source, section: source.section.replace('kind="work_order"', 'kind="unit"') }],
    ["reverse bill", { ...source, section: source.section.replace('kind="bill"', 'kind="invoice"') }],
    ["bill label producer", { ...source, route: source.route.replace("b.bill_number AS bill_number", "NULL::text AS bill_number") }],
    ["bill join scope", { ...source, route: source.route.replace("b.operating_company_id = $1::uuid", "TRUE") }],
    ["bill response label", { ...source, hook: source.hook.replace("bill_number?: string | null", "bill_label_missing?: string | null") }],
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
console.log(`${LABEL} PASS — road-service↔driver/unit/vendor/work-order share filtered, deep-link drillable reverse wiring`);
