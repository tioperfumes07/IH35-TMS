#!/usr/bin/env node
// Guard: the firewalled Manual Daily Projections routes (registerCashForecastManualRoutes) are
// registered UNCONDITIONALLY at boot — NOT behind a `process.env.CASH_FORECAST_ENABLED` env-var gate.
// History: the MDP tab is enabled via the lib.feature_flags DB flag (migration 202606162000), but the
// backend routes were additionally gated by an env var that was never set on Render, so the tab rendered
// while every /api/v1/forecast/* write 404'd (opening-balance + income/expense saves). Frontend visibility
// stays controlled by the DB feature flag; the routes must always mount so saves resolve.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-cash-forecast-routes-registered: ${m}`); process.exit(1); };
const src = readFileSync(join(root, "apps/backend/src/index.ts"), "utf8");

if (!/await registerCashForecastManualRoutes\(app\);/.test(src)) fail("registerCashForecastManualRoutes must be called");
// Must NOT be gated by the CASH_FORECAST_ENABLED env var.
if (/process\.env\.CASH_FORECAST_ENABLED[\s\S]{0,80}registerCashForecastManualRoutes/.test(src)) {
  fail("registerCashForecastManualRoutes must NOT be gated behind process.env.CASH_FORECAST_ENABLED (env never set in prod → 404 saves)");
}
console.log("PASS verify-cash-forecast-routes-registered");
