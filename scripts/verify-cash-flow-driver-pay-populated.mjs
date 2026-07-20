#!/usr/bin/env node
/**
 * verify-cash-flow-driver-pay-populated.mjs
 *
 * 0441-mod10-cashflow-driverpay-hardcoded-empty — DailyPrediction declared
 * kind: "driver_pay" but never constructed expense rows with that kind
 * (only bill_due / adjustment). Guard fails if cash-flow.service.ts lacks at
 * least one kind: "driver_pay" construction and a driver_finance.driver_settlements
 * read that feeds it.
 *
 * Static only (no DB). Usage:
 *   node scripts/verify-cash-flow-driver-pay-populated.mjs
 *   node scripts/verify-cash-flow-driver-pay-populated.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const LABEL = "verify-cash-flow-driver-pay-populated";

/** Pure checks — takes source text so --selftest can inject fixtures. */
export function check(source) {
  const f = [];
  if (!source) {
    f.push(`${FILE}: missing`);
    return f;
  }
  // Must construct expense items with kind driver_pay (not only the type union).
  if (!/kind:\s*"driver_pay"/.test(source)) {
    f.push(`${FILE}: must construct expense rows with kind: "driver_pay"`);
  }
  if (!/driver_finance\.driver_settlements/.test(source)) {
    f.push(`${FILE}: must query driver_finance.driver_settlements for driver_pay predictions`);
  }
  if (!/payment_state/.test(source)) {
    f.push(`${FILE}: driver_pay query must filter payment_state (queued/sent_to_bank)`);
  }
  return f;
}

export function run() {
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  return check(src);
}

function selftest() {
  const good = `
    expenseItems.push({ label: "x", amount_cents: 1, kind: "driver_pay" });
    FROM driver_finance.driver_settlements s
    WHERE COALESCE(s.payment_state, 'unpaid') IN ('queued', 'sent_to_bank')
  `;
  const badEmpty = `
    kind: "driver_pay" | "bill_due" | "adjustment";
    expenseItems.push({ kind: "bill_due" });
    expenseItems.push({ kind: "adjustment" });
  `;
  const badNoTable = `
    expenseItems.push({ kind: "driver_pay" });
    WHERE payment_state IN ('queued')
  `;
  const cases = [
    { name: "good", src: good, want: 0 },
    { name: "no construction", src: badEmpty, wantMin: 1 },
    { name: "no settlements table", src: badNoTable, wantMin: 1 },
  ];
  for (const c of cases) {
    const got = check(c.src).length;
    if (c.want != null && got !== c.want) {
      console.error(`${LABEL} --selftest ${c.name}: expected ${c.want} findings, got ${got}`);
      process.exit(1);
    }
    if (c.wantMin != null && got < c.wantMin) {
      console.error(`${LABEL} --selftest ${c.name}: expected >=${c.wantMin} findings, got ${got}`);
      process.exit(1);
    }
  }
  console.log(`[${LABEL}] --selftest OK`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const findings = run();
    if (findings.length) {
      console.error(`[${LABEL}] FAILED`);
      for (const e of findings) console.error("  ✗ " + e);
      process.exit(1);
    }
    console.log(`[${LABEL}] OK — cash-flow emits kind:"driver_pay" from driver_finance.driver_settlements`);
  }
}
