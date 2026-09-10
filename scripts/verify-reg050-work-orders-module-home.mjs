#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-reg050-work-orders-module-home";
const page = fs.readFileSync("apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/workOrdersConsole.ts", "utf8");
const route = fs.readFileSync("apps/backend/src/work-orders/work-orders.routes.ts", "utf8");

const controls = [
  "work-orders-filter-billing",
  "work-orders-filter-service-class",
  "work-orders-filter-unit",
  "work-orders-filter-driver",
  "work-orders-filter-search",
];

function audit(parts) {
  const failures = [];
  for (const id of controls) {
    if (!parts.page.includes(id)) failures.push(`missing visible filter control ${id}`);
  }
  if (!/listWorkOrdersConsole\(\{[\s\S]*unit_id:\s*unitId[\s\S]*driver_id:\s*driverId/.test(parts.page)) {
    failures.push("unit and driver filters must reach the canonical list request");
  }
  if (!/if \(params\.unit_id\) qs\.set\("unit_id"/.test(parts.api) || !/if \(params\.driver_id\) qs\.set\("driver_id"/.test(parts.api)) {
    failures.push("frontend API must serialize unit_id and driver_id");
  }
  if (!/if \(q\.unit_id\)[\s\S]*w\.unit_id = \$\$\{values\.length\}/.test(parts.route)) failures.push("route must scope unit_id");
  if (!/if \(q\.driver_id\)[\s\S]*w\.driver_id = \$\$\{values\.length\}/.test(parts.route)) failures.push("route must scope driver_id");
  if (!/operatorWorkOrderListSql\("w"\)/.test(parts.route)) failures.push("operator list visibility predicate must remain wired");
  if (!/where\.push\("w\.voided_at IS NULL"\)/.test(parts.route)) {
    failures.push("operator list rows and tab counts must exclude voided work orders");
  }
  return failures;
}

const sources = { page, api, route };
if (process.argv.includes("--selftest")) {
  const mutations = [
    ...controls.map((id) => ["page", id, "removed-filter-control"]),
    ["page", "unit_id: unitId", "unit_id: undefined"],
    ["page", "driver_id: driverId", "driver_id: undefined"],
    ["route", "operatorWorkOrderListSql(\"w\")", "\"TRUE\""],
    ["route", "where.push(\"w.voided_at IS NULL\")", "where.push(\"TRUE\")"],
  ];
  for (const [key, from, to] of mutations) {
    const changed = { ...sources, [key]: sources[key].replace(from, to) };
    if (changed[key] === sources[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — planted mutation escaped: ${key}:${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

const failures = audit(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — five visible filters reach the entity-scoped Work Orders read`);
