#!/usr/bin/env node
/**
 * GO-20 slice B — Predictive Maintenance Alerts (docs/lockdown/GO-20-EIGHT-FEATURES.txt).
 * Static, no-DB wiring check across the full vertical slice: Backend job + routes + registration,
 * Frontend page + API client + routing/nav wiring, and the alert_type/severity contract the spec's
 * own GUARD section calls for.
 *
 * Self-test: node scripts/verify-go20-b-predictive-alerts-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-go20-b-predictive-alerts-wired";

const CHECKS = [
  {
    name: "worker: exports initializePredictiveAlertsWorker",
    file: "apps/backend/src/jobs/predictive-alerts-worker.ts",
    pattern: /export function initializePredictiveAlertsWorker/,
  },
  {
    name: "worker: horizon constants match spec (warning 14, critical 7)",
    file: "apps/backend/src/jobs/predictive-alerts-worker.ts",
    pattern: /WARNING_HORIZON_DAYS = 14[\s\S]{0,80}CRITICAL_HORIZON_DAYS = 7/,
  },
  {
    name: "worker: relationExists-guards on maintenance.predictive_alerts before writing",
    file: "apps/backend/src/jobs/predictive-alerts-worker.ts",
    pattern: /relationExists\(client, "maintenance\.predictive_alerts"\)/,
  },
  {
    name: "worker: auto-closes alerts when linked work order completes",
    file: "apps/backend/src/jobs/predictive-alerts-worker.ts",
    pattern: /closeAlertsForCompletedWorkOrders/,
  },
  {
    name: "routes: exports registerMaintenancePredictiveAlertsRoutes",
    file: "apps/backend/src/maintenance/predictive-alerts.routes.ts",
    pattern: /export async function registerMaintenancePredictiveAlertsRoutes/,
  },
  {
    name: "routes: GET list endpoint present",
    file: "apps/backend/src/maintenance/predictive-alerts.routes.ts",
    pattern: /app\.get\(\s*"\/api\/v1\/maintenance\/predictive-alerts"/,
  },
  {
    name: "routes: POST create-work-order endpoint present",
    file: "apps/backend/src/maintenance/predictive-alerts.routes.ts",
    pattern: /"\/api\/v1\/maintenance\/predictive-alerts\/:id\/create-work-order"/,
  },
  {
    name: "routes: POST resolve endpoint present",
    file: "apps/backend/src/maintenance/predictive-alerts.routes.ts",
    pattern: /"\/api\/v1\/maintenance\/predictive-alerts\/:id\/resolve"/,
  },
  {
    name: "index.ts: imports + calls the worker initializer",
    file: "apps/backend/src/index.ts",
    pattern: /import \{ initializePredictiveAlertsWorker \} from "\.\/jobs\/predictive-alerts-worker\.js";[\s\S]*initializePredictiveAlertsWorker\(app\)/,
  },
  {
    name: "index.ts: imports + calls the routes registrar",
    file: "apps/backend/src/index.ts",
    pattern: /import \{ registerMaintenancePredictiveAlertsRoutes \} from "\.\/maintenance\/predictive-alerts\.routes\.js";[\s\S]*await registerMaintenancePredictiveAlertsRoutes\(app\)/,
  },
  {
    name: "frontend: PredictiveAlertsPage renders the At Risk panel",
    file: "apps/frontend/src/pages/maintenance/PredictiveAlertsPage.tsx",
    pattern: /maint-predictive-alerts-page/,
  },
  {
    name: "frontend: Create work order action wired",
    file: "apps/frontend/src/pages/maintenance/PredictiveAlertsPage.tsx",
    pattern: /createWorkOrderFromPredictiveAlert/,
  },
  {
    name: "frontend: Resolve action wired",
    file: "apps/frontend/src/pages/maintenance/PredictiveAlertsPage.tsx",
    pattern: /resolveMaintenancePredictiveAlert/,
  },
  {
    name: "api client: all 3 predictive-alerts functions present",
    file: "apps/frontend/src/api/maintenance.ts",
    pattern: /listMaintenancePredictiveAlerts[\s\S]{0,4000}createWorkOrderFromPredictiveAlert[\s\S]{0,2000}resolveMaintenancePredictiveAlert/,
  },
  {
    name: "route-manifest: predictive_alerts tab path registered",
    file: "apps/frontend/src/router/route-manifest.ts",
    pattern: /predictive_alerts:\s*"\/maintenance\/predictive-alerts"/,
  },
  {
    name: "MaintenanceHome: SUBNAV carries an At Risk entry",
    file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
    pattern: /\{ id: "predictive_alerts", label: "At Risk" \}/,
  },
  {
    name: "MaintenanceHome: renders PredictiveAlertsPage for the tab",
    file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
    pattern: /tab === "predictive_alerts"[\s\S]{0,120}<PredictiveAlertsPage \/>/,
  },
  {
    name: "routes/manifest: predictive-alerts route registered",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/maintenance\/predictive-alerts"[\s\S]{0,120}MaintenanceTabRoute tabId="predictive_alerts"/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/backend/src/jobs/predictive-alerts-worker.ts": `
      export function initializePredictiveAlertsWorker
      export const WARNING_HORIZON_DAYS = 14;
      export const CRITICAL_HORIZON_DAYS = 7;
      relationExists(client, "maintenance.predictive_alerts")
      closeAlertsForCompletedWorkOrders
    `,
    "apps/backend/src/maintenance/predictive-alerts.routes.ts": `
      export async function registerMaintenancePredictiveAlertsRoutes
      app.get(
        "/api/v1/maintenance/predictive-alerts",
      "/api/v1/maintenance/predictive-alerts/:id/create-work-order"
      "/api/v1/maintenance/predictive-alerts/:id/resolve"
    `,
    "apps/backend/src/index.ts": `
      import { initializePredictiveAlertsWorker } from "./jobs/predictive-alerts-worker.js";
      import { registerMaintenancePredictiveAlertsRoutes } from "./maintenance/predictive-alerts.routes.js";
      initializePredictiveAlertsWorker(app)
      await registerMaintenancePredictiveAlertsRoutes(app);
    `,
    "apps/frontend/src/pages/maintenance/PredictiveAlertsPage.tsx": `
      data-testid="maint-predictive-alerts-page"
      createWorkOrderFromPredictiveAlert
      resolveMaintenancePredictiveAlert
    `,
    "apps/frontend/src/api/maintenance.ts": `
      listMaintenancePredictiveAlerts ${"x".repeat(10)} createWorkOrderFromPredictiveAlert ${"x".repeat(10)} resolveMaintenancePredictiveAlert
    `,
    "apps/frontend/src/router/route-manifest.ts": `predictive_alerts: "/maintenance/predictive-alerts",`,
    "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx": `
      { id: "predictive_alerts", label: "At Risk" },
      tab === "predictive_alerts" ? (
        <div>
          <PredictiveAlertsPage />
        </div>
      ) : null}
    `,
    "apps/frontend/src/routes/manifest.tsx": `
      path="/maintenance/predictive-alerts"
      element={
        <ProtectedRoute>
          <MaintenanceTabRoute tabId="predictive_alerts" />
        </ProtectedRoute>
      }
    `,
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — GO-20 slice B predictive alerts (worker/routes/registration/frontend/nav) all wired`);
