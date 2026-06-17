#!/usr/bin/env node
// BLOCK 2 Phase 2b-ii guard — the cash-forecast income re-bucketing is FLAG-GATED and forecast-only.
// projected_cash_date = effective delivery + receivable lag; consumers bucket by it ONLY when
// CASH_FOLLOWS_ETA_ENABLED is on (default OFF keeps the current scheduled-delivery bucketing).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-cash-eta-rebucket-flag-gated: ${m}`);
  process.exit(1);
};

// 1. Helper computes projected_cash_date from the shared constants (one source of truth).
const helper = read("apps/backend/src/cash-flow/projected-cash-date.ts");
if (!helper.includes("projectedCashDateSql")) fail("projected-cash-date helper must export projectedCashDateSql");
if (!helper.includes("FACTORING_ADVANCE_DAYS") || !helper.includes("DEFAULT_NET_TERMS_DAYS")) {
  fail("helper must reuse the receivable-lag constants (factored T+1 / NET-30 fallback)");
}
if (!helper.includes("predicted_delivery_date")) fail("helper must use predicted_delivery_date in the effective date");

// 2. Service re-buckets via the helper, gated by a default-false flag param.
const svc = read("apps/backend/src/cash-flow/cash-flow.service.ts");
if (!svc.includes("projectedCashDateSql")) fail("cash-flow service must use projectedCashDateSql");
if (!/cashFollowsEta = false/.test(svc)) fail("re-bucket must default OFF (cashFollowsEta = false)");
if (!/cashFollowsEta\s*\?/.test(svc)) fail("the income query must branch on cashFollowsEta (OFF path unchanged)");

// 3. Route gates on the master flag.
const route = read("apps/backend/src/cash-flow/cash-flow.routes.ts");
if (!/isEnabled\(client, "CASH_FOLLOWS_ETA_ENABLED"/.test(route)) fail("route must gate on CASH_FOLLOWS_ETA_ENABLED");

// 4. Forecast-only: helper writes nothing (it's a SELECT expression, no DML/accounting).
if (/(INSERT|UPDATE|DELETE)\b/i.test(helper)) fail("projected-cash-date helper must be read-only (no DML)");

// 5. ALL projected-income consumers re-bucket under the flag — not just getDailyPrediction:
//    the 7-day strip and Actual-vs-Projected too (each default OFF / byte-identical).
if (!/buildSevenDayStrip\([\s\S]{0,80}cashFollowsEta/.test(svc)) fail("getDailyPrediction must pass cashFollowsEta to the 7-day strip");
if (!/async function buildSevenDayStrip\([\s\S]{0,160}cashFollowsEta = false/.test(svc)) fail("buildSevenDayStrip must accept a default-OFF cashFollowsEta");
if (!/export async function getActualVsProjected\([\s\S]{0,400}cashFollowsEta = false/.test(svc)) fail("getActualVsProjected must accept a default-OFF cashFollowsEta");
const reAvpGate = /getActualVsProjected\(client[\s\S]{0,200}cashFollowsEta\)/;
if (!reAvpGate.test(route)) fail("the actual-vs-projected route must pass cashFollowsEta");

console.log("PASS verify-cash-eta-rebucket-flag-gated");
