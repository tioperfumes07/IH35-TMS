#!/usr/bin/env node
/**
 * CI Guard: verify-cap-11-fuel-fraud.mjs — GAP-61 / CAP-11
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

read("db/migrations/202606071800_fuel_fraud_alerts.sql");
const migration = read("db/migrations/202606071800_fuel_fraud_alerts.sql");
contains("db/migrations/202606071800_fuel_fraud_alerts.sql", migration, [
  { pattern: /fuel\.fraud_alerts/, label: "fraud_alerts table" },
  { pattern: /GRANT SELECT, INSERT, UPDATE ON fuel\.fraud_alerts TO ih35_app/, label: "ih35_app GRANT" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
]);

const rules = read("apps/backend/src/integrations/fuel/fraud-detector/rules.service.ts");
contains("apps/backend/src/integrations/fuel/fraud-detector/rules.service.ts", rules, [
  { pattern: /RULE_GPS_MISMATCH/, label: "GPS mismatch rule" },
  { pattern: /RULE_TANK_OVERFLOW/, label: "tank overflow rule" },
  { pattern: /RULE_OFF_DUTY/, label: "off duty rule" },
  { pattern: /RULE_RAPID_MULTI/, label: "rapid multi rule" },
  { pattern: /RULE_INACTIVE_TRUCK/, label: "inactive truck rule" },
  { pattern: /vehicle_driver_assignments/, label: "telematics pairing usage" },
]);

read("apps/backend/src/integrations/fuel/fraud-detector/alerter.service.ts");
const routes = read("apps/backend/src/integrations/fuel/fraud-detector/routes.ts");
contains("apps/backend/src/integrations/fuel/fraud-detector/routes.ts", routes, [
  { pattern: /\/api\/fuel\/fraud-alerts/, label: "list route" },
  { pattern: /\/investigate/, label: "investigate route" },
  { pattern: /\/confirm-fraud/, label: "confirm fraud route" },
  { pattern: /\/dismiss/, label: "dismiss route" },
  { pattern: /registerFuelFraudAlertRoutes/, label: "register function" },
]);

const worker = read("apps/backend/src/jobs/fuel-fraud-detector-worker.ts");
contains("apps/backend/src/jobs/fuel-fraud-detector-worker.ts", worker, [
  { pattern: /\*\/15 \* \* \* \*/, label: "15 minute cron" },
  { pattern: /initializeFuelFraudDetectorWorker/, label: "worker init export" },
]);

read("apps/backend/src/integrations/fuel/fraud-detector/__tests__/rules.test.ts");
read("apps/backend/src/integrations/fuel/fraud-detector/__tests__/alerter.test.ts");

const fuelHome = read("apps/frontend/src/pages/fuel/FuelHome.tsx");
contains("apps/frontend/src/pages/fuel/FuelHome.tsx", fuelHome, [
  { pattern: /Open Fraud Alerts/, label: "Open Fraud Alerts KPI card" },
]);

read("apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx");
read("apps/frontend/src/components/fuel/FuelFraudBadge.tsx");

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerFuelFraudAlertRoutes/, label: "fraud routes registered" },
  { pattern: /initializeFuelFraudDetectorWorker/, label: "fraud worker registered" },
]);

const docs = read("docs/specs/gap-61-cap-11-fuel-fraud-alerts.md");
contains("docs/specs/gap-61-cap-11-fuel-fraud-alerts.md", docs, [
  { pattern: /GAP-61/, label: "GAP-61 identifier" },
  { pattern: /CAP-11/, label: "CAP-11 reference" },
]);

const manifest = read(".block-ready/GAP-61.json");
contains(".block-ready/GAP-61.json", manifest, [
  { pattern: /verify:cap-11-fuel-fraud/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:cap-11-fuel-fraud/, label: "verify script in package.json" },
]);

if (failures.length > 0) {
  console.error("verify-cap-11-fuel-fraud FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-cap-11-fuel-fraud PASS");
