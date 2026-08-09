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
  const broken = orig
    .replace(/gross_amount_cents/g, "amount_cents")
    .replace(/bill_number/g, "line_type");
  if (broken === orig) {
    console.error(`[${LABEL}] --selftest could not plant regression`);
    process.exit(1);
  }
  fs.writeFileSync(abs, broken);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.status === 0) {
      console.error(`[${LABEL}] --selftest FAIL: planted settlement-line mapping still passed`);
      process.exit(1);
    }
    console.log(`[${LABEL}] --selftest PASS: planted regression failed closed`);
  } finally {
    fs.writeFileSync(abs, orig);
  }
  process.exit(0);
}

main();
