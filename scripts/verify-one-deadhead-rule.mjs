#!/usr/bin/env node
// ROUND 288.3 item 2 / ROUND 296 4 (CC-1) — ONE DEADHEAD RULE, REVERSE-ROUTED. The driver bill, the Settlement Creator
// and batch pay each priced empty miles their own way (batch pay never paid deadhead and sent the customer's total as
// driver line-haul pay). Fails if:
//   1. any of the three stops pricing deadhead through driver-finance/deadhead-rule.ts (deadheadRateCents /
//      deadheadPayCents) — change the rule there and all three change;
//   2. batch pay stops building the settlement from the load's driver bill, or sends the customer's rate_total_cents
//      as the driver's line-haul amount again.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-deadhead-rule";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  rule: "apps/backend/src/driver-finance/deadhead-rule.ts",
  book: "apps/backend/src/dispatch/book-load.service.ts",
  creator: "apps/backend/src/driver-finance/settlement-creator-empty-pay.ts",
  batch: "apps/backend/src/driver-finance/batch-settlements.service.ts",
};

export function problems(src) {
  const p = [];
  if (!/export function deadheadRateCents/.test(src.rule) || !/export function deadheadPayCents/.test(src.rule)) p.push("deadhead-rule.ts must export deadheadRateCents and deadheadPayCents");
  if (!/deadheadRateCents\(/.test(src.book) || !/deadheadPayCents\(milesDeadhead/.test(src.book)) p.push("the driver bill (book-load) must price deadhead through the one rule");
  if (!/deadheadRateCents\(/.test(src.creator) || !/deadheadPayCents\(/.test(src.creator)) p.push("the Settlement Creator must price deadhead through the one rule");
  if (!/empty_rate_cents: hasBill \? load\.bill_rate_empty_per_mile_cents/.test(src.batch) || !/empty_miles: hasBill \? load\.bill_miles_deadhead/.test(src.batch)) p.push("batch pay must pay the driver bill's deadhead (miles + rate)");
  if (/line_haul_amount_cents: load\.rate_total_cents/.test(src.batch)) p.push("batch pay sends the customer's total as the driver's line-haul amount");
  if (!/line_haul_amount_cents: hasBill \? load\.bill_loaded_pay_cents/.test(src.batch)) p.push("batch pay must take loaded pay from the driver bill");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["batch no deadhead", { ...src, batch: src.batch.replace("empty_rate_cents: hasBill ? load.bill_rate_empty_per_mile_cents : null", "empty_rate_cents: null") }],
      ["batch revenue as pay", { ...src, batch: src.batch.replace("line_haul_amount_cents: hasBill ? load.bill_loaded_pay_cents : null", "line_haul_amount_cents: load.rate_total_cents") }],
      ["book-load own rule", { ...src, book: src.book.replace("deadheadPayCents(milesDeadhead", "Math.round(milesDeadhead") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — the driver bill, the Settlement Creator and batch pay price deadhead with one rule; batch pay settles the bill.`);
}
