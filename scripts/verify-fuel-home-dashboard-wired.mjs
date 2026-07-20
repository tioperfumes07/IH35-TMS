#!/usr/bin/env node
/**
 * verify-fuel-home-dashboard-wired.mjs — f-01-fuel-home-stub
 *
 * FuelHome.tsx must call GET /api/v1/fuel/planner/dashboard (via getFuelDashboard)
 * and render mtd_spend + fleet_mpg (via FuelKpiRow or inline).
 *
 * Self-test: node scripts/verify-fuel-home-dashboard-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/fuel/FuelHome.tsx");
const LABEL = "verify-fuel-home-dashboard-wired";

/**
 * @param {string} source
 * @returns {string[]}
 */
export function computeFailures(source) {
  const errors = [];
  if (!/getFuelDashboard/.test(source) && !/\/api\/v1\/fuel\/planner\/dashboard/.test(source)) {
    errors.push("FuelHome.tsx must fetch getFuelDashboard or /api/v1/fuel/planner/dashboard");
  }
  if (!/FuelKpiRow/.test(source) && !/mtd_spend/.test(source)) {
    errors.push("FuelHome.tsx must render FuelKpiRow or mtd_spend");
  }
  if (!/FuelKpiRow/.test(source) && !/fleet_mpg/.test(source)) {
    errors.push("FuelHome.tsx must render FuelKpiRow or fleet_mpg");
  }
  if (!/FuelFraudAlertsKpiCard/.test(source) || !/RelayHistoryImport/.test(source)) {
    errors.push("FuelHome.tsx must keep FuelFraudAlertsKpiCard + RelayHistoryImport (additive-only)");
  }
  return errors;
}

function selftest() {
  const good = `
    import { getFuelDashboard } from "../../api/fuelPlanner";
    import { FuelKpiRow } from "./components/FuelKpiRow";
    import { RelayHistoryImport } from "./components/RelayHistoryImport";
    export function FuelFraudAlertsKpiCard() {}
    export function FuelHomePage() {
      getFuelDashboard(id);
      return <><FuelKpiRow /><FuelFraudAlertsKpiCard /><RelayHistoryImport /></>;
    }
  `;
  const bad = `
    export function FuelFraudAlertsKpiCard() {}
    export function FuelHomePage() {
      return <><FuelFraudAlertsKpiCard /><RelayHistoryImport /></>;
    }
  `;
  let ok = true;
  for (const c of [
    { name: "wired", input: good, expectPass: true },
    { name: "stub only", input: bad, expectPass: false },
  ]) {
    const failures = computeFailures(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}: ${JSON.stringify(failures)}`);
    } else console.log(`selftest ok — ${c.name}`);
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const source = fs.readFileSync(PAGE, "utf8");
  const failures = computeFailures(source);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Fuel Home dashboard KPIs wired`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
