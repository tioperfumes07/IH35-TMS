#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesPath = path.join(ROOT, "apps/backend/src/mdata/units.routes.ts");
const aggregatePath = path.join(ROOT, "apps/backend/src/mdata/unit-aggregate.service.ts");
const equipmentAggregatePath = path.join(ROOT, "apps/backend/src/mdata/equipment-aggregate.service.ts");
const maintenanceSnapshotPath = path.join(ROOT, "apps/frontend/src/components/vehicle-profile/MaintenanceSnapshotSection.tsx");

const routes = fs.readFileSync(routesPath, "utf8");
const aggregate = fs.readFileSync(aggregatePath, "utf8");
const equipmentAggregate = fs.readFileSync(equipmentAggregatePath, "utf8");
const maintenanceSnapshot = fs.readFileSync(maintenanceSnapshotPath, "utf8");

function pmScheduleScopeFailures(unitSource, equipmentSource) {
  const scopedJoin = /JOIN maintenance\.pm_schedules ps ON ps\.id = pa\.pm_schedule_id\s+AND ps\.operating_company_id = pa\.operating_company_id/;
  return [
    ["unit aggregate PM schedule join", scopedJoin.test(unitSource)],
    ["trailer aggregate PM schedule join", scopedJoin.test(equipmentSource)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

function lastServiceVendorFailures(unitSource, consumerSource) {
  const failures = [];
  if (!/COALESCE\(w\.external_vendor_id, w\.vendor_id\)::text AS vendor_id/.test(unitSource)) failures.push("unit aggregate last-service canonical vendor id");
  if (!/LEFT JOIN mdata\.vendors v ON v\.id = COALESCE\(w\.external_vendor_id, w\.vendor_id\)\s+AND v\.operating_company_id = w\.operating_company_id/.test(unitSource)) failures.push("unit aggregate last-service canonical vendor label join");
  if (!/EntityLinkOrTombstone[\s\S]{0,180}kind="vendor"[\s\S]{0,180}id=\{String\(lastService\.vendor_id\)\}[\s\S]{0,180}name=\{lastService\.vendor\}/.test(consumerSource)) failures.push("vehicle profile last-service vendor EntityLink");
  return failures;
}

function unitMaintenanceVoidFailures(unitSource) {
  const failures = [];
  if (!/FROM maintenance\.work_orders w\s+WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid\s+AND w\.voided_at IS NULL\s+AND w\.status NOT IN \('complete', 'completed', 'cancelled'\)/.test(unitSource)) failures.push("unit aggregate open-work-order counts exclude voided rows");
  if (!/COALESCE\(w\.external_vendor_id, w\.vendor_id\)::text AS vendor_id[\s\S]{0,500}WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid\s+AND w\.voided_at IS NULL\s+AND w\.status IN \('complete', 'completed'\)/.test(unitSource)) failures.push("unit aggregate last-service read excludes voided rows");
  if (!/w\.description[\s\S]{0,180}FROM maintenance\.work_orders w\s+WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid\s+AND w\.voided_at IS NULL\s+ORDER BY COALESCE\(w\.updated_at, w\.opened_at\)/.test(unitSource)) failures.push("unit aggregate recent-work-order reverse list excludes voided rows");
  return failures;
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
const lastServiceVendorMissing = lastServiceVendorFailures(aggregate, maintenanceSnapshot);
if (lastServiceVendorMissing.length > 0) {
  console.error(`verify:aggregate-shape-route FAIL: missing canonical last-service vendor chain: ${lastServiceVendorMissing.join(", ")}`);
  process.exit(1);
}
const unitMaintenanceVoidMissing = unitMaintenanceVoidFailures(aggregate);
if (unitMaintenanceVoidMissing.length > 0) {
  console.error(`verify:aggregate-shape-route FAIL: voided maintenance rows remain visible: ${unitMaintenanceVoidMissing.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const unscoped = "JOIN maintenance.pm_schedules ps ON ps.id = pa.pm_schedule_id";
  const scoped = /JOIN maintenance\.pm_schedules ps ON ps\.id = pa\.pm_schedule_id\s+AND ps\.operating_company_id = pa\.operating_company_id/;
  const mutations = [
    pmScheduleScopeFailures(aggregate.replace(scoped, unscoped), equipmentAggregate),
    pmScheduleScopeFailures(aggregate, equipmentAggregate.replace(scoped, unscoped)),
    lastServiceVendorFailures(aggregate.replace("COALESCE(w.external_vendor_id, w.vendor_id)::text AS vendor_id", "w.external_vendor_id::text AS vendor_id"), maintenanceSnapshot),
    lastServiceVendorFailures(aggregate.replace("v.id = COALESCE(w.external_vendor_id, w.vendor_id)", "v.id = w.external_vendor_id"), maintenanceSnapshot),
    lastServiceVendorFailures(aggregate, maintenanceSnapshot.replace('kind="vendor"', 'kind="vendor_removed"')),
    unitMaintenanceVoidFailures(aggregate.replace(/(FROM maintenance\.work_orders w\s+WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid)\s+AND w\.voided_at IS NULL(\s+AND w\.status NOT IN \('complete', 'completed', 'cancelled'\))/, "$1$2")),
    unitMaintenanceVoidFailures(aggregate.replace(/(COALESCE\(w\.external_vendor_id, w\.vendor_id\)::text AS vendor_id[\s\S]{0,500}WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid)\s+AND w\.voided_at IS NULL(\s+AND w\.status IN \('complete', 'completed'\))/, "$1$2")),
    unitMaintenanceVoidFailures(aggregate.replace(/(w\.description[\s\S]{0,180}FROM maintenance\.work_orders w\s+WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid)\s+AND w\.voided_at IS NULL(\s+ORDER BY COALESCE\(w\.updated_at, w\.opened_at\))/, "$1$2")),
  ];
  if (mutations.some((failures) => failures.length === 0)) {
    console.error("verify:aggregate-shape-route SELFTEST FAIL: a PM schedule company-scope mutation stayed green");
    process.exit(1);
  }
  console.log("verify:aggregate-shape-route SELFTEST PASS — 8/8 aggregate scope/vendor/void mutations red");
  process.exit(0);
}

console.log("verify:aggregate-shape-route PASS");
