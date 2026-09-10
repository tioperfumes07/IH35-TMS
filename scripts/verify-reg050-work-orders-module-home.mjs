#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-reg050-work-orders-module-home";
const page = fs.readFileSync("apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/workOrdersConsole.ts", "utf8");
const route = fs.readFileSync("apps/backend/src/work-orders/work-orders.routes.ts", "utf8");
const detail = fs.readFileSync("apps/frontend/src/pages/work-orders/WorkOrdersConsoleDetailPage.tsx", "utf8");
const labor = fs.readFileSync("apps/backend/src/maintenance/labor.routes.ts", "utf8");
const timePanel = fs.readFileSync("apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx", "utf8");

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
  if (!/key:\s*"total_estimated_cost"[\s\S]*label:\s*"Estimated"/.test(parts.page)) {
    failures.push("estimated cost must have its own column");
  }
  if (!/key:\s*"total_actual_cost"[\s\S]*label:\s*"Actual"/.test(parts.page)) {
    failures.push("actual cost must have its own column");
  }
  if (/label:\s*"Est \/ Act"/.test(parts.page)) failures.push("estimated and actual costs may not share one column");
  if (!/const canApprove = status === "open" && !wo\?\.approved_at/.test(parts.detail)) {
    failures.push("Approve must only be enabled for an unapproved open work order");
  }
  if (!/const canStart = status === "open" && Boolean\(wo\?\.approved_at\)/.test(parts.detail)) {
    failures.push("Start work must only be enabled for an approved open work order");
  }
  if (!/const canComplete = status === "in_progress"/.test(parts.detail)) {
    failures.push("Complete must only be enabled for an in-progress work order");
  }
  if (!/const canCancel = \["open", "in_progress", "waiting_parts"\]\.includes\(status\)/.test(parts.detail)) {
    failures.push("Cancel must be hidden for terminal work orders");
  }
  if (!/WHERE id = \$1\s+AND operating_company_id = \$3::uuid[\s\S]*AND status = 'open'[\s\S]*AND voided_at IS NULL/.test(parts.route)) {
    failures.push("approve endpoint must reject terminal or voided work orders");
  }
  if (!/WOTimeTrackingPanel[\s\S]*readOnly=\{\["complete", "cancelled"\]\.includes\(status\)\}/.test(parts.detail)) {
    failures.push("terminal work orders must render labor tracking read-only");
  }
  if (!/readOnly\?: boolean/.test(parts.timePanel) || !/disabled=\{readOnly \|\| startMut\.isPending/.test(parts.timePanel)) {
    failures.push("labor tracking create actions must honor terminal read-only state");
  }
  const writableWoPredicates = parts.labor.match(/SELECT id FROM maintenance\.work_orders[\s\S]{0,240}?voided_at IS NULL[\s\S]{0,120}?status NOT IN \('complete', 'cancelled'\)/g) ?? [];
  if (writableWoPredicates.length < 2) failures.push("timer start and manual time entry must both reject terminal work orders");
  return failures;
}

const sources = { page, api, route, detail, labor, timePanel };
if (process.argv.includes("--selftest")) {
  const mutations = [
    ...controls.map((id) => ["page", id, "removed-filter-control"]),
    ["page", "unit_id: unitId", "unit_id: undefined"],
    ["page", "driver_id: driverId", "driver_id: undefined"],
    ["route", "operatorWorkOrderListSql(\"w\")", "\"TRUE\""],
    ["route", "where.push(\"w.voided_at IS NULL\")", "where.push(\"TRUE\")"],
    ["page", "key: \"total_actual_cost\"", "key: \"total_estimated_cost\""],
    ["detail", "const canComplete = status === \"in_progress\"", "const canComplete = true"],
    ["route", "AND status = 'open'", "AND status <> 'open'"],
    ["detail", 'readOnly={["complete", "cancelled"].includes(status)}', "readOnly={false}"],
    ["labor", "AND voided_at IS NULL", "AND voided_at IS NOT NULL"],
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
