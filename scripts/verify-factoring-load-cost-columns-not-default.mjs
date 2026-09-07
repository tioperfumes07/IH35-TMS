#!/usr/bin/env node
/**
 * verify-factoring-load-cost-columns-not-default.mjs
 *
 * NEW-22 (owner 2026-09-07): "Chargeback and Fee History currently shows Load Costs data
 * (fees/driver-pay/margin) — wrong. Every Factoring tab must default to factoring-only columns
 * (reserve, fees, settlement #); Profit/Trip Expenses must NOT be selected by default, only
 * addable via the gear." Live-verified on /factoring/chargebacks-fees (Chrome, this session):
 * the Chargebacks + fee history table rendered Revenue/Costs/Driver pay/Margin columns visible
 * by default, sourced from the shared FAC-08 Load-Costs manifest (loadCostColumnManifest.tsx),
 * which set no column as `defaultHidden` at all.
 *
 * FIX: the four P&L/profitability columns (Revenue, Costs, Driver pay, Margin) are now built
 * with `defaultHidden: true` in the ONE shared manifest both RecoursePipelineTable.tsx and
 * ChargebacksTable.tsx consume — never removed from the gear (Rule 07), just unchecked by
 * default. Factoring-native columns (Factoring fee, Reserve, Advanced, Due) are untouched.
 *
 * Usage:
 *   node scripts/verify-factoring-load-cost-columns-not-default.mjs            # scan
 *   node scripts/verify-factoring-load-cost-columns-not-default.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-load-cost-columns-not-default";
const MANIFEST = "apps/frontend/src/pages/factoring/loadCostColumnManifest.tsx";

const PROFIT_COLUMN_IDS = ["revenue", "costs", "driver_pay", "margin"];
const FACTORING_COLUMN_IDS = ["factoring_fee", "reserve", "advanced", "due"];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/**
 * Finds each `moneyCol("id", ...)` call and checks whether its options object contains
 * `defaultHidden: true`. Exported for --selftest.
 */
export function checkColumnDefaults(src) {
  const failures = [];
  for (const id of PROFIT_COLUMN_IDS) {
    const re = new RegExp(`moneyCol\\(\\s*["']${id}["'][\\s\\S]{0,200}?\\)\\s*,`);
    const match = src.match(re);
    if (!match) {
      failures.push(`${MANIFEST}: could not find the moneyCol("${id}", ...) call.`);
      continue;
    }
    if (!/defaultHidden:\s*true/.test(match[0])) {
      failures.push(
        `${MANIFEST}: "${id}" must be built with { defaultHidden: true } — it is a Load Costs ` +
          `P&L figure, not a factoring-native one, and must not be checked by default.`,
      );
    }
  }
  for (const id of FACTORING_COLUMN_IDS) {
    const re = new RegExp(`moneyCol\\(\\s*["']${id}["'][\\s\\S]{0,200}?\\)\\s*,`);
    const match = src.match(re);
    if (match && /defaultHidden:\s*true/.test(match[0])) {
      failures.push(
        `${MANIFEST}: "${id}" is a factoring-native column and must stay visible by default — ` +
          `it must not carry defaultHidden: true.`,
      );
    }
  }
  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(MANIFEST);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkColumnDefaults(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
    moneyCol("revenue", "Revenue", (f) => f.revenueCents, { defaultHidden: true }),
    moneyCol("costs", "Costs", (f) => f.costsCents, { defaultHidden: true }),
    moneyCol("driver_pay", "Driver pay", (f) => f.driverPayCents, { defaultHidden: true }),
    moneyCol("margin", "Margin", (f) => f.marginCents, { redWhenNegative: true, defaultHidden: true }),
    moneyCol("factoring_fee", "Factoring fee", (f) => f.factoringFeeCents),
    moneyCol("reserve", "Reserve", (f) => f.reserveCents),
    moneyCol("advanced", "Advanced", (f) => f.advancedCents),
    moneyCol("due", "Due", (f) => f.dueCents),
  `;
  const badMissingRevenue = goodSrc.replace(
    'moneyCol("revenue", "Revenue", (f) => f.revenueCents, { defaultHidden: true }),',
    'moneyCol("revenue", "Revenue", (f) => f.revenueCents),',
  );
  const badMissingMargin = goodSrc.replace(
    'moneyCol("margin", "Margin", (f) => f.marginCents, { redWhenNegative: true, defaultHidden: true }),',
    'moneyCol("margin", "Margin", (f) => f.marginCents, { redWhenNegative: true }),',
  );
  const badFactoringFeeHidden = goodSrc.replace(
    'moneyCol("factoring_fee", "Factoring fee", (f) => f.factoringFeeCents),',
    'moneyCol("factoring_fee", "Factoring fee", (f) => f.factoringFeeCents, { defaultHidden: true }),',
  );

  const checks = [
    ["clean manifest passes", checkColumnDefaults(goodSrc).length === 0],
    ["missing revenue defaultHidden fails", checkColumnDefaults(badMissingRevenue).length > 0],
    ["missing margin defaultHidden fails", checkColumnDefaults(badMissingMargin).length > 0],
    ["factoring_fee wrongly hidden fails", checkColumnDefaults(badFactoringFeeHidden).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — Revenue/Costs/Driver pay/Margin default-hidden, factoring-native columns default-visible (NEW-22)`,
);
process.exit(0);
