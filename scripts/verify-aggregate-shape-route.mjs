#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["vendor"],"leaves":["trailer.profile.maintenance"],"task":"FLT-F6306-TRAILER-LAST-SERVICE-VENDOR-REVERSE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesPath = path.join(ROOT, "apps/backend/src/mdata/units.routes.ts");
const aggregatePath = path.join(ROOT, "apps/backend/src/mdata/unit-aggregate.service.ts");
const equipmentAggregatePath = path.join(ROOT, "apps/backend/src/mdata/equipment-aggregate.service.ts");
const maintenanceSnapshotPath = path.join(ROOT, "apps/frontend/src/components/vehicle-profile/MaintenanceSnapshotSection.tsx");
const fleetRequiredPath = path.join(ROOT, "docs/specs/scoreboard/modules/fleet.required.json");

const routes = fs.readFileSync(routesPath, "utf8");
const aggregate = fs.readFileSync(aggregatePath, "utf8");
const equipmentAggregate = fs.readFileSync(equipmentAggregatePath, "utf8");
const maintenanceSnapshot = fs.readFileSync(maintenanceSnapshotPath, "utf8");
const fleetRequired = fs.readFileSync(fleetRequiredPath, "utf8");

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
  if (!/LEFT JOIN LATERAL \(\s+SELECT scoped_vendor\.vendor_name\s+FROM mdata\.get_vendor_same_company\(\s+COALESCE\(w\.external_vendor_id, w\.vendor_id\),\s+w\.operating_company_id\s+\) scoped_vendor\s+LIMIT 1\s+\) v ON TRUE/.test(unitSource)) failures.push("unit aggregate last-service canonical historical vendor label resolver");
  if (!/EntityLinkOrTombstone[\s\S]{0,180}kind="vendor"[\s\S]{0,180}id=\{String\(lastService\.vendor_id\)\}[\s\S]{0,180}name=\{lastService\.vendor\}/.test(consumerSource)) failures.push("vehicle profile last-service vendor EntityLink");
  return failures;
}

function unitMaintenanceVoidFailures(unitSource) {
  const failures = [];
  if (!/FROM maintenance\.work_orders w\s+WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid\s+AND w\.voided_at IS NULL\s+AND w\.status NOT IN \('complete', 'completed', 'cancelled'\)/.test(unitSource)) failures.push("unit aggregate open-work-order counts exclude voided rows");
  if (!/COALESCE\(w\.external_vendor_id, w\.vendor_id\)::text AS vendor_id[\s\S]{0,500}WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid\s+AND w\.voided_at IS NULL\s+AND w\.status IN \('complete', 'completed'\)/.test(unitSource)) failures.push("unit aggregate last-service read excludes voided rows");
  if (!/w\.description[\s\S]{0,180}FROM maintenance\.work_orders w\s+WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid\s+AND w\.voided_at IS NULL[\s\S]{0,180}ORDER BY COALESCE\(w\.updated_at, w\.opened_at\)/.test(unitSource)) failures.push("unit aggregate recent-work-order reverse list excludes voided rows");
  return failures;
}

function currentLoadCustomerFailures(unitSource) {
  const failures = [];
  if (!/l\.customer_id::text AS customer_id[\s\S]{0,900}LEFT JOIN LATERAL \(\s+SELECT scoped_customer\.customer_name\s+FROM mdata\.get_customer_same_company\(l\.customer_id, l\.operating_company_id\) scoped_customer\s+LIMIT 1\s+\) c ON TRUE[\s\S]{0,260}WHERE l\.assigned_unit_id = \$1::uuid\s+AND l\.operating_company_id = \$2::uuid/.test(unitSource)) {
    failures.push("unit aggregate current-load customer reverse must use the scoped historical customer resolver");
  }
  return failures;
}

function vehicleLocationSchemaFailures(unitSource) {
  const failures = [];
  if (!/SELECT odometer_mi\s+FROM telematics\.vehicle_locations[\s\S]{0,500}ORDER BY captured_at DESC NULLS LAST\s+LIMIT 1/.test(unitSource)) {
    failures.push("unit aggregate vehicle-location lookup must select the migration-defined odometer_mi column");
  }
  if (!/parseSamsaraVehiclePayload\(locPayloadRes\.rows\[0\] \?\? null\)/.test(unitSource)) {
    failures.push("unit aggregate must parse the selected vehicle-location row without a phantom payload field");
  }
  if (/SELECT payload\s+FROM telematics\.vehicle_locations/.test(unitSource)) {
    failures.push("unit aggregate must not query phantom telematics.vehicle_locations.payload");
  }
  return failures;
}

function trailerLastServiceVendorFailures(equipmentSource, consumerSource, requiredSource) {
  const failures = [];
  if (!/COALESCE\(w\.external_vendor_id, w\.vendor_id\)::text AS vendor_id[\s\S]{0,500}FROM maintenance\.work_orders w\s+LEFT JOIN LATERAL \(\s+SELECT scoped_vendor\.vendor_name\s+FROM mdata\.get_vendor_same_company\(\s+COALESCE\(w\.external_vendor_id, w\.vendor_id\),\s+w\.operating_company_id\s+\) scoped_vendor\s+LIMIT 1\s+\) v ON TRUE[\s\S]{0,260}WHERE w\.equipment_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid/.test(equipmentSource)) failures.push("trailer aggregate last-service canonical historical vendor chain");
  if (!/EntityLinkOrTombstone[\s\S]{0,180}kind="vendor"[\s\S]{0,180}id=\{String\(lastService\.vendor_id\)\}/.test(consumerSource)) failures.push("shared maintenance snapshot last-service vendor drill");
  const required = JSON.parse(requiredSource);
  let leaf;
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value.id === "trailer.profile.maintenance" && Array.isArray(value.required)) leaf = value;
      Object.values(value).forEach(visit);
    }
  };
  visit(required);
  if (!leaf?.required?.includes("vendor")) failures.push("fleet trailer.profile.maintenance must honestly require vendor");
  return failures;
}

const routeStart = routes.indexOf('"/api/v1/mdata/units/:id"');
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
const currentLoadCustomerMissing = currentLoadCustomerFailures(aggregate);
if (currentLoadCustomerMissing.length > 0) {
  console.error(`verify:aggregate-shape-route FAIL: current-load customer reverse is unresolved: ${currentLoadCustomerMissing.join(", ")}`);
  process.exit(1);
}
const vehicleLocationSchemaMissing = vehicleLocationSchemaFailures(aggregate);
if (vehicleLocationSchemaMissing.length > 0) {
  console.error(`verify:aggregate-shape-route FAIL: vehicle-location schema drift: ${vehicleLocationSchemaMissing.join(", ")}`);
  process.exit(1);
}
const trailerLastServiceVendorMissing = trailerLastServiceVendorFailures(equipmentAggregate, maintenanceSnapshot, fleetRequired);
if (trailerLastServiceVendorMissing.length > 0) {
  console.error(`verify:aggregate-shape-route FAIL: trailer last-service vendor is unwired: ${trailerLastServiceVendorMissing.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const unscoped = "JOIN maintenance.pm_schedules ps ON ps.id = pa.pm_schedule_id";
  const scoped = /JOIN maintenance\.pm_schedules ps ON ps\.id = pa\.pm_schedule_id\s+AND ps\.operating_company_id = pa\.operating_company_id/;
  const mutations = [
    pmScheduleScopeFailures(aggregate.replace(scoped, unscoped), equipmentAggregate),
    pmScheduleScopeFailures(aggregate, equipmentAggregate.replace(scoped, unscoped)),
    lastServiceVendorFailures(aggregate.replace("COALESCE(w.external_vendor_id, w.vendor_id)::text AS vendor_id", "w.external_vendor_id::text AS vendor_id"), maintenanceSnapshot),
    lastServiceVendorFailures(aggregate.replace("mdata.get_vendor_same_company(", "mdata.get_vendor_active_only("), maintenanceSnapshot),
    lastServiceVendorFailures(aggregate, maintenanceSnapshot.replace('kind="vendor"', 'kind="vendor_removed"')),
    unitMaintenanceVoidFailures(aggregate.replace(/(FROM maintenance\.work_orders w\s+WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid)\s+AND w\.voided_at IS NULL(\s+AND w\.status NOT IN \('complete', 'completed', 'cancelled'\))/, "$1$2")),
    unitMaintenanceVoidFailures(aggregate.replace(/(COALESCE\(w\.external_vendor_id, w\.vendor_id\)::text AS vendor_id[\s\S]{0,500}WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid)\s+AND w\.voided_at IS NULL(\s+AND w\.status IN \('complete', 'completed'\))/, "$1$2")),
    unitMaintenanceVoidFailures(aggregate.replace(/(w\.description[\s\S]{0,180}FROM maintenance\.work_orders w\s+WHERE w\.unit_id = \$1::uuid\s+AND w\.operating_company_id = \$2::uuid)\s+AND w\.voided_at IS NULL/, "$1")),
    currentLoadCustomerFailures(aggregate.replace("mdata.get_customer_same_company(l.customer_id, l.operating_company_id)", "mdata.customers")),
    vehicleLocationSchemaFailures(
      aggregate
        .replace("SELECT odometer_mi\n      FROM telematics.vehicle_locations", "SELECT payload\n      FROM telematics.vehicle_locations")
        .replace("parseSamsaraVehiclePayload(locPayloadRes.rows[0] ?? null)", "parseSamsaraVehiclePayload(locPayloadRes.rows[0]?.payload ?? null)")
    ),
    trailerLastServiceVendorFailures(equipmentAggregate.replace("mdata.get_vendor_same_company(", "mdata.get_vendor_active_only("), maintenanceSnapshot, fleetRequired),
    trailerLastServiceVendorFailures(equipmentAggregate, maintenanceSnapshot, fleetRequired.replace(/("id": "trailer\.profile\.maintenance"[\s\S]{0,220})"vendor",/, '$1"vendor_MISSING",')),
  ];
  if (mutations.some((failures) => failures.length === 0)) {
    console.error("verify:aggregate-shape-route SELFTEST FAIL: a PM schedule company-scope mutation stayed green");
    process.exit(1);
  }
  console.log("verify:aggregate-shape-route SELFTEST PASS — 12/12 aggregate scope/vendor/void/customer/schema mutations red");
  process.exit(0);
}

console.log("verify:aggregate-shape-route PASS");
