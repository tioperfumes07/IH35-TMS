#!/usr/bin/env node
/**
 * CI Guard: verify-cap-9-pairing.mjs — GAP-59 / CAP-9
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/202606080217_vehicle_driver_pairing_audit.sql");
contains("db/migrations/202606080217_vehicle_driver_pairing_audit.sql", migration, [
  { pattern: /samsara_assignment_id/, label: "samsara_assignment_id column" },
  { pattern: /vehicle_driver_pairing_overlap_flags/, label: "overlap flags table" },
  { pattern: /GRANT USAGE ON SCHEMA telematics TO ih35_app/, label: "schema grant" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
]);

read("db/migrations/0221_cap9_vehicle_driver_assignments.sql");

const service = read("apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.ts");
contains("apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.ts", service, [
  { pattern: /export async function syncFromSamsara/, label: "syncFromSamsara" },
  { pattern: /export async function lookupDriverForVehicleAtTime/, label: "lookupDriverForVehicleAtTime" },
  { pattern: /telematics\.vehicle_driver_assignments/, label: "telematics table wrapper" },
  { pattern: /detectAndFlagOverlaps/, label: "overlap detection" },
  { pattern: /applyManualOverride/, label: "manual override" },
]);
function pairingScopeFailures(source) {
  const missing = [];
  for (const alias of ["pairing_sync_dca", "pairing_history_dca"]) {
    if (!new RegExp(`FROM mdata\\.driver_company_authorizations ${alias}[\\s\\S]{0,260}${alias}\\.operating_company_id = \\$1::uuid[\\s\\S]{0,180}${alias}\\.is_authorized = true[\\s\\S]{0,180}${alias}\\.deactivated_at IS NULL`).test(source)) {
      missing.push(`${alias} active selected-company authorization`);
    }
  }
  return missing;
}
for (const missing of pairingScopeFailures(service)) fail(`pairing.service.ts: missing ${missing}`);

read("apps/backend/src/integrations/samsara/vehicle-driver-pairing/__tests__/pairing.test.ts");

const routes = read("apps/backend/src/integrations/samsara/vehicle-driver-pairing/routes.ts");
contains("apps/backend/src/integrations/samsara/vehicle-driver-pairing/routes.ts", routes, [
  { pattern: /\/api\/integrations\/samsara\/pairing\/at-event/, label: "at-event route" },
  { pattern: /\/api\/integrations\/samsara\/pairing\/driver-history/, label: "driver-history route" },
  { pattern: /\/api\/integrations\/samsara\/pairing\/manual-override/, label: "manual-override route" },
  { pattern: /registerSamsaraVehicleDriverPairingRoutes/, label: "register export" },
]);

const lookupHelper = read("apps/backend/src/lib/at-time-of-event-lookup.ts");
contains("apps/backend/src/lib/at-time-of-event-lookup.ts", lookupHelper, [
  { pattern: /export async function lookupDriverForVehicleAtTime/, label: "shared lookup export" },
]);

const worker = read("apps/backend/src/jobs/vehicle-driver-pairing-worker.ts");
contains("apps/backend/src/jobs/vehicle-driver-pairing-worker.ts", worker, [
  { pattern: /0 \* \* \* \*/, label: "hourly cron" },
  { pattern: /initializeVehicleDriverPairingWorker/, label: "worker init export" },
  { pattern: /syncFromSamsara/, label: "sync tick" },
]);

const telematicsRoutes = read("apps/backend/src/telematics/vehicle-driver-pairing.routes.ts");
contains("apps/backend/src/telematics/vehicle-driver-pairing.routes.ts", telematicsRoutes, [
  { pattern: /registerVehicleDriverPairingRoutes/, label: "legacy telematics routes preserved" },
]);

const fuelRules = read("apps/backend/src/integrations/fuel/fraud-detector/rules.service.ts");
contains("apps/backend/src/integrations/fuel/fraud-detector/rules.service.ts", fuelRules, [
  { pattern: /vehicle_driver_assignments/, label: "fuel module pairing usage" },
]);

const dtcWo = read("apps/backend/src/telematics/dtc-auto-work-order.service.ts");
contains("apps/backend/src/telematics/dtc-auto-work-order.service.ts", dtcWo, [
  { pattern: /getDriverForVehicleAtTime/, label: "maintenance module pairing usage" },
]);

const harshEvents = read("apps/backend/src/safety/harsh-events-ingestion.service.ts");
contains("apps/backend/src/safety/harsh-events-ingestion.service.ts", harshEvents, [
  { pattern: /getDriverForVehicleAtTime/, label: "safety module pairing usage" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerSamsaraVehicleDriverPairingRoutes/, label: "pairing routes registered" },
  { pattern: /initializeVehicleDriverPairingWorker/, label: "pairing worker registered" },
  { pattern: /registerVehicleDriverPairingRoutes/, label: "legacy telematics routes registered" },
]);

const docs = read("docs/specs/gap-59-cap-9-vehicle-driver-pairing.md");
contains("docs/specs/gap-59-cap-9-vehicle-driver-pairing.md", docs, [
  { pattern: /GAP-59/, label: "GAP-59 identifier" },
  { pattern: /CAP-9/, label: "CAP-9 reference" },
  { pattern: /telematics\.vehicle_driver_assignments/, label: "existing telematics table" },
]);

const manifest = read(".block-ready/GAP-59.json");
contains(".block-ready/GAP-59.json", manifest, [
  { pattern: /verify:cap-9-pairing/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:cap-9-pairing/, label: "verify script in package.json" },
]);

if (failures.length > 0) {
  console.error("verify-cap-9-pairing FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    service.replace("pairing_sync_dca.is_authorized = true", "pairing_sync_dca.is_authorized = false"),
    service.replace("pairing_history_dca.deactivated_at IS NULL", "pairing_history_dca.deactivated_at IS NOT NULL"),
  ];
  const caught = mutations.filter((source) => pairingScopeFailures(source).length > 0).length;
  if (caught !== mutations.length) {
    console.error(`verify-cap-9-pairing SELFTEST FAILED: caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`verify-cap-9-pairing SELFTEST PASS — ${caught}/${mutations.length} shared-driver mutations red`);
  process.exit(0);
}

console.log("verify-cap-9-pairing PASS");
