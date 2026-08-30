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
  { pattern: /\/api\/v1\/fuel\/fraud-alerts/, label: "canonical list route" },
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
function fuelHomeHonestyFailures(source) {
  const found = [];
  if (!/summaryLoaded = summaryQuery\.data !== undefined/.test(source)) found.push("fraud summary does not distinguish unresolved from true zero");
  if (!/summaryLoaded \? openCritical : "…"/.test(source)) found.push("fraud KPI loading state can paint zero");
  return found;
}
for (const message of fuelHomeHonestyFailures(fuelHome)) fail(`apps/frontend/src/pages/fuel/FuelHome.tsx: ${message}`);

const fraudAlertsPage = read("apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx");
function fraudMutationErrorFailures(source) {
  const found = [];
  if (!/import\s+\{\s*userFacingApiError\s*\}\s+from\s+["']\.\.\/\.\.\/\.\.\/lib\/api-error-message["']/.test(source)) {
    found.push("missing shared user-facing API error formatter");
  }
  const mutations = [
    ["investigateMut", "confirmMut", "Could not mark the alert as investigating"],
    ["confirmMut", "dismissMut", "Could not confirm the alert as fraud"],
    ["dismissMut", "const rows", "Could not dismiss the alert"],
  ];
  for (const [start, end, fallback] of mutations) {
    const startAt = source.indexOf(`const ${start} = useMutation({`);
    const endAt = source.indexOf(end === "const rows" ? "const rows" : `const ${end} = useMutation({`, startAt + 1);
    const block = startAt >= 0 && endAt > startAt ? source.slice(startAt, endAt) : "";
    if (!block) {
      found.push(`${start} mutation block missing`);
      continue;
    }
    if (!block.includes("onError:") || !block.includes("userFacingApiError(error") || !block.includes(fallback)) {
      found.push(`${start} rejected PATCH is not surfaced visibly`);
    }
  }
  return found;
}

for (const message of fraudMutationErrorFailures(fraudAlertsPage)) fail(`apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx: ${message}`);

if (process.argv.includes("--selftest")) {
  const baseline = fraudMutationErrorFailures(fraudAlertsPage);
  if (baseline.length > 0) {
    console.error(`verify-cap-11-fuel-fraud selftest baseline failed: ${baseline.join("; ")}`);
    process.exit(1);
  }
  const fallbacks = [
    "Could not mark the alert as investigating",
    "Could not confirm the alert as fraud",
    "Could not dismiss the alert",
  ];
  for (const fallback of fallbacks) {
    const mutant = fraudAlertsPage.replace(fallback, "Request failed");
    if (mutant === fraudAlertsPage || fraudMutationErrorFailures(mutant).length === 0) {
      console.error(`verify-cap-11-fuel-fraud selftest failed to reject missing handler: ${fallback}`);
      process.exit(1);
    }
  }
  const homeMutants = [
    fuelHome.replace("summaryLoaded = summaryQuery.data !== undefined", "summaryLoaded = true"),
    fuelHome.replace('summaryLoaded ? openCritical : "…"', "openCritical"),
  ];
  for (const mutant of homeMutants) {
    if (mutant === fuelHome || fuelHomeHonestyFailures(mutant).length === 0) {
      console.error("verify-cap-11-fuel-fraud selftest failed to reject false-zero loading state");
      process.exit(1);
    }
  }
  console.log("verify-cap-11-fuel-fraud selftest PASS — 3 rejected-PATCH + 2 false-zero mutations proven");
  process.exit(0);
}
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

// CLASS FIX (2026-08-08) — a guard must not fail for the absence of the one edit the constitution forbids.
//
// This block required a `verify:cap-11-fuel-fraud` entry in package.json. Rule 17 (no-guard-hotfile-thrash) and
// verify-guard-wired's own header both say the opposite, verbatim:
//
//     "NEW GUARDS: add scripts/verify-X.mjs + scripts/verify-steps/NNN-verify-X.mjs ONLY.
//      Do NOT edit package.json / locked-guards.yml / ci.yml — that is the shared-file thrash."
//     "package.json script is OPTIONAL (local convenience only)."
//
// So these guards were red for missing the single edit they are forbidden to make, and "fixing" them
// literally meant touching a serialized hot file every lane contends on. Execution is proven by the
// verify-step, so that is what is reported — as a NOTE, because wiring needs a claimed number (Rule 37).
const wiredStep__cap_11_fuel_fraud = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-cap-11-fuel-fraud\.mjs$/.test(f));
if (!wiredStep__cap_11_fuel_fraud) {
  console.warn(
    "verify-cap-11-fuel-fraud: NOTE — no scripts/verify-steps/NNNN-verify-cap-11-fuel-fraud.mjs, so this guard does not execute " +
      "in CI. Wiring it requires a claimed step number (Rule 37); a package.json script does not wire it.",
  );
}

if (failures.length > 0) {
  console.error("verify-cap-11-fuel-fraud FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-cap-11-fuel-fraud PASS");
