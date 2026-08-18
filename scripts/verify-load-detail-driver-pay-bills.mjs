#!/usr/bin/env node
/**
 * verify-load-detail-driver-pay-bills.mjs
 * FAIL-SETL-DRIVER-PAY-TAB — Load Driver Pay tab must map driver_finance.driver_bills
 * (gross_amount_cents / bill_number / status), not settlement_line fields.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const TARGET = "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx";
const LABEL = "verify-load-detail-driver-pay-bills";

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[${LABEL}] FAIL: missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

function check(src) {
  const errors = [];
  if (!src.includes("gross_amount_cents")) {
    errors.push("must read gross_amount_cents from driver_bills");
  }
  if (!src.includes("bill_number")) {
    errors.push("must display bill_number");
  }
  if (/line_type/.test(src)) {
    errors.push("must not treat driver_bills as settlement lines (line_type)");
  }
  if (/\bamount_cents\b/.test(src)) {
    errors.push("must not reference amount_cents (settlement-line shape)");
  }
  if (/once a settlement is composed/.test(src)) {
    errors.push("empty-state must not claim pay only appears after settlement composition");
  }
  if (!src.includes("/api/v1/driver-finance/driver-bills")) {
    errors.push("must call /api/v1/driver-finance/driver-bills");
  }
  // LIVE 2026-08-18: EntityLink kind bill resolved driver_finance.driver_bills ids to
  // /accounting/bills/:id → bill_not_found (B-20260810-0003 / 31f155f3-…).
  // Ban JSX EntityLink props only (ignore prose comments).
  if (/<EntityLink[\s\S]{0,200}?kind\s*=\s*["']bill["']/.test(src)) {
    errors.push("must not EntityLink kind=bill for driver_finance.driver_bills (AP bills are a different table)");
  }
  if (!src.includes('kind="settlement"') && !src.includes("kind='settlement'")) {
    errors.push("must reverse-link settled driver bills via kind=settlement when settled_in_settlement_id is set");
  }
  if (!src.includes("settled_in_settlement_id")) {
    errors.push("must read settled_in_settlement_id for settlement reverse drill");
  }
  return errors;
}

function main() {
  const src = read(TARGET);
  const errors = check(src);
  if (errors.length) {
    console.error(`[${LABEL}] FAIL:\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS — Driver Pay tab maps driver_bills header fields`);
}

if (process.argv.includes("--selftest")) {
  const abs = path.join(ROOT, TARGET);
  const orig = fs.readFileSync(abs, "utf8");
  // Plant 1: settlement-line field mapping (original ratchet)
  const brokenFields = orig
    .replace(/gross_amount_cents/g, "amount_cents")
    .replace(/bill_number/g, "line_type");
  // Plant 2: AP bill EntityLink (LIVE bill_not_found class)
  const brokenBillKind = orig.includes('kind="settlement"')
    ? orig.replace(/kind="settlement"/g, 'kind="bill"').replace(/settled_in_settlement_id/g, "accounting_bill_id")
    : orig + '\n<EntityLink kind="bill" id={bill.id} />\n';
  for (const [label, broken] of [
    ["settlement-line mapping", brokenFields],
    ["kind=bill AP drill", brokenBillKind],
  ]) {
    if (broken === orig) {
      console.error(`[${LABEL}] --selftest could not plant ${label}`);
      process.exit(1);
    }
    fs.writeFileSync(abs, broken);
    try {
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        cwd: ROOT,
        encoding: "utf8",
      });
      if (r.status === 0) {
        console.error(`[${LABEL}] --selftest FAIL: planted ${label} still passed`);
        process.exit(1);
      }
      console.log(`[${LABEL}] --selftest PASS: planted ${label} failed closed`);
    } finally {
      fs.writeFileSync(abs, orig);
    }
  }
  process.exit(0);
}

main();
