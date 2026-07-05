#!/usr/bin/env node
// Static regression guard for the SETTLEMENT-BILL-PAYMENT engine (blueprint §3). Fails the build if a
// load-bearing invariant regresses:
//   1. The shared bill-payment poster SKIPS non-cash settlement-deduction bill_payments (both in
//      buildBillPaymentLines and the backfill) — else deductions double-reduce A/P + credit phantom cash.
//   2. The engine is FLAG-GATED (SETTLEMENT_GL_POSTING_ENABLED) and NO-OPs when OFF.
//   3. Advance/escrow deductions credit the DRIVER'S OWN sub-accounts and FAIL LOUD when unprovisioned
//      (never silently fall back to the shared recovery account).
//   4. The migration seeds SETTLEMENT_GL_POSTING_ENABLED default OFF and adds the non-cash marker column.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const fail = (m) => { console.error(`[verify-settlement-bill-payment] FAIL — ${m}`); process.exit(1); };

const engine = read("apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts");
const posting = read("apps/backend/src/accounting/posting-engine.service.ts");

// (1) shared poster skip guard
if (!/settlement_deduction_noncash === true/.test(posting) || !/PAYMENT_NOT_POSTING_ELIGIBLE/.test(posting)) {
  fail("posting-engine buildBillPaymentLines no longer skips settlement_deduction_noncash bill payments");
}
if (!/COALESCE\(settlement_deduction_noncash, false\)\s*=\s*false/.test(posting)) {
  fail("posting-engine backfill no longer filters out settlement_deduction_noncash bill payments");
}

// (2) flag gate + no-op
if (!/SETTLEMENT_GL_POSTING_FLAG_KEY/.test(engine) || !/skipped_flag_off/.test(engine)) {
  fail("settlement engine is not flag-gated (SETTLEMENT_GL_POSTING_ENABLED) with a no-op path");
}

// (3) driver-own sub-account fail-loud (never shared recovery for advance/escrow)
for (const code of ["DRIVER_ADVANCE_ACCOUNT_MISSING", "DRIVER_ESCROW_ACCOUNT_MISSING", "resolveDriverOwnAccount"]) {
  if (!engine.includes(code)) fail(`settlement engine missing ${code} (driver-own sub-account resolution/fail-loud)`);
}

// (4) migration: flag default OFF + marker column
const migDir = "db/migrations";
const mig = readdirSync(join(ROOT, migDir)).find((f) => f.includes("settlement_bill_payment_posting"));
if (!mig) fail("settlement_bill_payment_posting migration not found");
const migSql = read(join(migDir, mig));
if (!/settlement_deduction_noncash boolean NOT NULL DEFAULT false/.test(migSql)) {
  fail("migration does not add accounting.bill_payments.settlement_deduction_noncash DEFAULT false");
}
if (!/'SETTLEMENT_GL_POSTING_ENABLED'[\s\S]*?false, 0/.test(migSql)) {
  fail("migration does not seed SETTLEMENT_GL_POSTING_ENABLED default OFF");
}

console.log("[verify-settlement-bill-payment] OK — non-cash skip guard, flag gate, driver-own fail-loud, and OFF-by-default migration all present.");
