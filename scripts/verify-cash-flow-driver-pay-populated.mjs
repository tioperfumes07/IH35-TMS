#!/usr/bin/env node
/**
 * verify-cash-flow-driver-pay-populated — 0441-mod10-cashflow-driverpay-hardcoded-empty
 *
 * Daily cash-flow prediction must emit real kind:"driver_pay" expense rows from
 * driver_finance.driver_settlements (queued / sent_to_bank), not only bill_due /
 * adjustment. Guards against the prior empty-stub path that left DailyPredictionTab's
 * "Driver Pay" label unreachable.
 *
 * Usage:
 *   node scripts/verify-cash-flow-driver-pay-populated.mjs
 *   node scripts/verify-cash-flow-driver-pay-populated.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-flow-driver-pay-populated";
const TARGET = "apps/backend/src/cash-flow/cash-flow.service.ts";

function check(src) {
  const errors = [];
  // Object construction: kind: "driver_pay",  — not the TypeScript union `kind: "driver_pay" | ...`
  if (!/kind:\s*"driver_pay"\s*,/.test(src)) {
    errors.push(`${TARGET}: must construct expense items with kind: "driver_pay"`);
  }
  if (!/FROM\s+driver_finance\.driver_settlements/i.test(src)) {
    errors.push(`${TARGET}: driver_pay rows must query driver_finance.driver_settlements`);
  }
  if (!/['"]queued['"]/.test(src) || !/['"]sent_to_bank['"]/.test(src)) {
    errors.push(`${TARGET}: driver_pay query must filter payment_state queued|sent_to_bank`);
  }
  if (!/expenseItems\.push\(/.test(src) || !/kind:\s*"driver_pay"\s*,/.test(src)) {
    errors.push(`${TARGET}: driver_pay construction must push into expenseItems`);
  }
  // Regression: empty stub with TODO must not return.
  if (/Degrade gracefully \(no driver-pay lines\)/.test(src)) {
    errors.push(`${TARGET}: stub TODO path still present — driver_pay must be wired`);
  }
  return errors;
}

function selftest() {
  const good = `
    const driverPayRows = await client.query(\`SELECT ... FROM driver_finance.driver_settlements s
      WHERE payment_state IN ('queued', 'sent_to_bank')\`);
    for (const row of driverPayRows.rows) {
      expenseItems.push({ label: "x", amount_cents: 1, kind: "driver_pay", });
    }
  `;
  const badEmpty = `
    export type ExpenseLineItem = { kind: "driver_pay" | "bill_due" | "adjustment" };
    // Degrade gracefully (no driver-pay lines) rather than crash
    const expenseItems = [];
    expenseItems.push({ kind: "bill_due", });
  `;
  const badNoTable = `
    expenseItems.push({ kind: "driver_pay", });
  `;
  const g = check(good);
  const b1 = check(badEmpty);
  const b2 = check(badNoTable);
  if (g.length) {
    console.error(`${LABEL} SELFTEST FAIL: good fixture rejected:`, g);
    process.exit(1);
  }
  if (!b1.length || !b2.length) {
    console.error(`${LABEL} SELFTEST FAIL: bad fixtures must fail`, { b1, b2 });
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const abs = path.join(ROOT, TARGET);
  if (!fs.existsSync(abs)) {
    console.error(`${LABEL} FAIL: missing ${TARGET}`);
    process.exit(1);
  }
  const errors = check(fs.readFileSync(abs, "utf8"));
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — cash-flow.service.ts emits driver_pay from driver_settlements`);
}

main();
