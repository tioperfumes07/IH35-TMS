#!/usr/bin/env node
/**
 * BANK-F91038 — Amount to Credit → vendor credit on bill-payment Save.
 *
 * Static contract (always):
 *  - applyVendorBillPaymentBatch creates vendor_credits with source_bill_payment_id on overpay
 *  - posting-engine lists vendor_credit and buildVendorCreditOverpayLines uses Dr A/P / Cr cash
 *  - pay-bills accepts amount_cents >= sum(applications)
 *  - WriteCheckForm enables Save while credit > 0 and sends amount_cents
 *
 * Live arm (DATABASE_URL): USMCA vendor_credits with source_bill_payment_id count (0 OK until
 * first overpay). Static wiring always runs and is the merge gate.
 */
export const ALLOW_OFFLINE_SKIP =
  "static wiring always runs (selftest); live USMCA count is informational until first overpay";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const LABEL = "verify-bill-payment-overpay-creates-vendor-credit";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(hay, needle, why) {
  if (!hay.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${why}\n  missing: ${needle}`);
    process.exit(1);
  }
}

function selftest() {
  const batch = read("apps/backend/src/accounting/vendor-bill-payments.routes.ts");
  const engine = read("apps/backend/src/accounting/posting-engine.service.ts");
  const routes = read("apps/backend/src/accounting/checks/checks.routes.ts");
  const fe = read("apps/frontend/src/components/checks/WriteCheckForm.tsx");
  const mig = read("db/migrations/202615292200_vendor_credits_source_bill_payment_id.sql");

  assertIncludes(mig, "source_bill_payment_id", "migration adds source_bill_payment_id");
  assertIncludes(batch, "source_bill_payment_id", "batch writes source_bill_payment_id");
  assertIncludes(batch, "overpayCents", "batch computes overpay");
  assertIncludes(batch, 'source_transaction_type: "vendor_credit"', "batch posts vendor_credit");
  assertIncludes(engine, '"vendor_credit"', "posting engine registers vendor_credit");
  assertIncludes(engine, "buildVendorCreditOverpayLines", "overpay builder present");
  assertIncludes(engine, "VENDOR_CREDIT_NO_CASH_ORIGIN", "manual credits refuse GL");
  assertIncludes(routes, "amount_cents_below_applications", "pay-bills validates amount_cents");
  assertIncludes(fe, "amount_cents: billPaymentTotalCents", "FE sends full check face");
  assertIncludes(fe, "billPaymentTotalCents > 0", "FE allows Save with credit");
  if (fe.includes("billPaymentCreditCents === 0")) {
    console.error(`${LABEL}: FAIL — WriteCheckForm still blocks Save while credit > 0`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — static wiring present`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  selftest();
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP live — no DATABASE_URL`);
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const col = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema='accounting' AND table_name='vendor_credits' AND column_name='source_bill_payment_id'`
    );
    if (!col.rows[0]) {
      console.log(`${LABEL}: LIVE INFO — column not applied on this DB yet (migration pending deploy)`);
    } else {
      const rows = await client.query(
        `SELECT count(*)::int AS n
           FROM accounting.vendor_credits
          WHERE operating_company_id = $1::uuid
            AND source_bill_payment_id IS NOT NULL
            AND voided_at IS NULL`,
        [USMCA]
      );
      console.log(`${LABEL}: LIVE PASS — USMCA cash-backed vendor credits n=${rows.rows[0].n} (0 OK until first overpay)`);
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`${LABEL}: FAIL`, err);
  process.exit(1);
});
