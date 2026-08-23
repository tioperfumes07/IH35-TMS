#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesPath = path.join(ROOT, "apps/backend/src/mdata/units.routes.ts");
const aggregatePath = path.join(ROOT, "apps/backend/src/mdata/unit-aggregate.service.ts");
const equipmentAggregatePath = path.join(ROOT, "apps/backend/src/mdata/equipment-aggregate.service.ts");

const routes = fs.readFileSync(routesPath, "utf8");
const aggregate = fs.readFileSync(aggregatePath, "utf8");
const equipmentAggregate = fs.readFileSync(equipmentAggregatePath, "utf8");

function pmScheduleScopeFailures(unitSource, equipmentSource) {
  const scopedJoin = /JOIN maintenance\.pm_schedules ps ON ps\.id = pa\.pm_schedule_id\s+AND ps\.operating_company_id = pa\.operating_company_id/;
  return [
    ["unit aggregate PM schedule join", scopedJoin.test(unitSource)],
    ["trailer aggregate PM schedule join", scopedJoin.test(equipmentSource)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

const routeStart = routes.indexOf('app.get("/api/v1/mdata/units/:id"');
if (routeStart < 0) {
  console.error("verify:aggregate-shape-route FAIL: missing GET /api/v1/mdata/units/:id route");
  process.exit(1);
}
const routeHandler = routes.slice(routeStart, routeStart + 2500);
if (!routeHandler.includes("buildUnitAggregate(")) {
  console.error("verify:aggregate-shape-route FAIL: GET /api/v1/mdata/units/:id must call buildUnitAggregate");
  process.exit(1);
}
if (/reply\.code\(\d+\)\.send\(row\)|SELECT[\s\S]{0,120}FROM mdata\.units[\s\S]{0,120}LIMIT 1/.test(routeHandler)) {
  console.error("verify:aggregate-shape-route FAIL: GET /api/v1/mdata/units/:id appears to return flat SELECT row");
  process.exit(1);
}

const fnStart = aggregate.indexOf("export async function buildUnitAggregate");
if (fnStart < 0) {
  console.error("verify:aggregate-shape-route FAIL: missing buildUnitAggregate export");
  process.exit(1);
}
const fnBody = aggregate.slice(fnStart);

const requiredKeys = ["unit", "plates", "samsara", "compliance", "open_wo_count", "reefer", "maintenance_alerts"];
const missing = requiredKeys.filter((k) => !fnBody.includes(`${k},`) && !fnBody.includes(`${k}:`));
if (missing.length > 0) {
  console.error(`verify:aggregate-shape-route FAIL: buildUnitAggregate return missing keys: ${missing.join(", ")}`);
  process.exit(1);
}

const pmScopeMissing = pmScheduleScopeFailures(aggregate, equipmentAggregate);
if (pmScopeMissing.length > 0) {
  console.error(`verify:aggregate-shape-route FAIL: missing company scope: ${pmScopeMissing.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const unscoped = "JOIN maintenance.pm_schedules ps ON ps.id = pa.pm_schedule_id";
  const scoped = /JOIN maintenance\.pm_schedules ps ON ps\.id = pa\.pm_schedule_id\s+AND ps\.operating_company_id = pa\.operating_company_id/;
  const mutations = [
    pmScheduleScopeFailures(aggregate.replace(scoped, unscoped), equipmentAggregate),
    pmScheduleScopeFailures(aggregate, equipmentAggregate.replace(scoped, unscoped)),
  ];
  if (mutations.some((failures) => failures.length === 0)) {
    console.error("verify:aggregate-shape-route SELFTEST FAIL: a PM schedule company-scope mutation stayed green");
    process.exit(1);
  }
  console.log("verify:aggregate-shape-route SELFTEST PASS — 2/2 PM schedule scope mutations red");
  process.exit(0);
}

console.log("verify:aggregate-shape-route PASS");
