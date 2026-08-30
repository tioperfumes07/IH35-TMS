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
const KPI = path.join(ROOT, "apps/frontend/src/pages/fuel/components/FuelKpiRow.tsx");
const PLANNER = path.join(ROOT, "apps/backend/src/fuel/planner.routes.ts");
const LABEL = "verify-fuel-home-dashboard-wired";
const SPEND_FAKE_ZERO_RE =
  /FROM fuel\.fuel_transactions[\s\S]{0,400}\.catch\(\(\) => \(\{ rows: \[\{ spend: 0, avg_price: 0 \}\] \}\)\)/;
const SEND_TO_DRIVER_DB_ERROR_AS_404_RE =
  /FROM fuel\.route_recommendations[\s\S]{0,450}\.catch\(\(\) => \(\{ rows: \[\]/;
const DETAIL_FALSE_EMPTY_RE =
  /FROM fuel\.recommended_stops[\s\S]{0,500}\.catch\(\(\) => \(\{ rows: \[\]|recommendFuelStopsForRecommendation\([\s\S]{0,250}\.catch\(\(\) => \[\]\)/;

/**
 * @param {string} source
 * @returns {string[]}
 */
export function computePlannerFailures(plannerSource) {
  const errors = [];
  if (SPEND_FAKE_ZERO_RE.test(plannerSource)) {
    errors.push(
      "planner.routes.ts must not coerce a failed fuel.fuel_transactions spend query to { spend: 0, avg_price: 0 }",
    );
  }
  if (!/FROM fuel\.fuel_transactions/.test(plannerSource)) {
    errors.push("planner.routes.ts must keep the MTD spend query on fuel.fuel_transactions");
  }
  if (SEND_TO_DRIVER_DB_ERROR_AS_404_RE.test(plannerSource)) {
    errors.push(
      "planner.routes.ts send-to-driver must not catch a route_recommendations query failure as empty rows (that becomes a fake 404)",
    );
  }
  if (DETAIL_FALSE_EMPTY_RE.test(plannerSource)) {
    errors.push("planner.routes.ts detail stop/HOS query failures must propagate instead of rendering empty recommendations");
  }
  return errors;
}

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
  if (!/lovesSyncQuery\.isError[\s\S]{0,240}<ListErrorBanner[\s\S]{0,180}lovesSyncQuery\.refetch\(\)/.test(source)) {
    errors.push("FuelHome.tsx must disclose Love's sync-status failure and retry the exact query");
  }
  return errors;
}

export function computeKpiFailures(source) {
  const errors = [];
  if (!/dashboard === undefined \|\| lovesSyncStatus === undefined\) return null/.test(source)) {
    errors.push("FuelKpiRow must not assert Never until both authoritative sync feeds resolve");
  }
  return errors;
}

function selftest() {
  const plannerGood = `
      const spendRes = await client.query(\`SELECT COALESCE(sum(total_cost), 0)::numeric AS spend FROM fuel.fuel_transactions\`);
  `;
  const plannerBad = `
      FROM fuel.fuel_transactions
          WHERE operating_company_id = $1::uuid
      ).catch(() => ({ rows: [{ spend: 0, avg_price: 0 }] }));
  `;
  const plannerGoodFails = computePlannerFailures(plannerGood);
  if (plannerGoodFails.length) {
    console.error(`SELFTEST FAIL — planner good: ${JSON.stringify(plannerGoodFails)}`);
    process.exit(1);
  }
  const plannerBadFails = computePlannerFailures(plannerBad);
  if (!plannerBadFails.length) {
    console.error("SELFTEST FAIL — planner fake-zero catch should fail");
    process.exit(1);
  }
  console.log("selftest ok — planner spend fail-loud");
  const sendCatchBad = `
          FROM fuel.route_recommendations
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        \`,
        [params.data.id, companyId]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  `;
  if (!computePlannerFailures(sendCatchBad).some((e) => e.includes("fake 404"))) {
    console.error("SELFTEST FAIL — send-to-driver catch-as-empty should fail");
    process.exit(1);
  }
  if (computePlannerFailures(plannerGood).some((e) => e.includes("fake 404"))) {
    console.error("SELFTEST FAIL — spend-only planner source must not trip send-to-driver catch");
    process.exit(1);
  }
  console.log("selftest ok — send-to-driver fail-loud");
  const detailCatchBad = `${plannerGood}
    FROM fuel.recommended_stops WHERE recommendation_id = $1
    ).catch(() => ({ rows: [] }));
    recommendFuelStopsForRecommendation(client, input).catch(() => []);
  `;
  if (!computePlannerFailures(detailCatchBad).some((e) => e.includes("stop/HOS"))) {
    console.error("SELFTEST FAIL — planner detail catch-as-empty should fail");
    process.exit(1);
  }
  console.log("selftest ok — planner detail fail-loud");
  const kpiSource = fs.readFileSync(KPI, "utf8");
  if (computeKpiFailures(kpiSource).length) {
    console.error("SELFTEST FAIL — shipped Fuel KPI sync honesty baseline is red");
    process.exit(1);
  }
  const kpiMutant = kpiSource.replace("if (dashboard === undefined || lovesSyncStatus === undefined) return null;", 'return "Never";');
  if (kpiMutant === kpiSource || computeKpiFailures(kpiMutant).length === 0) {
    console.error("SELFTEST FAIL — false Never sync mutation escaped");
    process.exit(1);
  }
  console.log("selftest ok — unresolved Love's sync cannot assert Never");
  const good = `
    import { getFuelDashboard } from "../../api/fuelPlanner";
    import { FuelKpiRow } from "./components/FuelKpiRow";
    import { RelayHistoryImport } from "./components/RelayHistoryImport";
    export function FuelFraudAlertsKpiCard() {}
    export function FuelHomePage() {
      getFuelDashboard(id);
      return <>{lovesSyncQuery.isError ? <ListErrorBanner onRetry={() => void lovesSyncQuery.refetch()} /> : null}<FuelKpiRow /><FuelFraudAlertsKpiCard /><RelayHistoryImport /></>;
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
  const retryNoOp = good.replace("lovesSyncQuery.refetch()", "undefined");
  if (!computeFailures(retryNoOp).some((failure) => failure.includes("sync-status failure"))) {
    console.error("SELFTEST FAIL — Love's sync-status retry no-op should fail");
    process.exit(1);
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const source = fs.readFileSync(PAGE, "utf8");
  const planner = fs.readFileSync(PLANNER, "utf8");
  const kpi = fs.readFileSync(KPI, "utf8");
  const failures = [...computeFailures(source), ...computePlannerFailures(planner), ...computeKpiFailures(kpi)];
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Fuel Home dashboard KPIs wired; spend query fail-loud`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
