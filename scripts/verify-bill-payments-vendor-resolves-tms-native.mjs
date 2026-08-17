#!/usr/bin/env node
/**
 * FINDING: LV-BILL-PAYMENTS-VENDOR-NOT-VISIBLE-TMS-NATIVE — found live 2026-08-16 while performing
 * the assigned driver-finance:bill-payment-create-chrome live-verify. The USMCA Bill Payments list
 * showed "Vendor — not visible" for a real payment whose bill genuinely had a vendor FK set
 * (accounting.bills.mdata_vendor_id = a real, active mdata.vendors row). Root cause:
 * accounting.bill_payments.vendor_id holds two different shapes depending on how the payment was
 * created -- a legacy QBO vendor id string (TRANSP) or the mdata.vendors.id uuid itself as text
 * (TMS-native payments -- USMCA has no QuickBooks). All 4 vendor-name/id resolution sites in
 * bills.service.ts matched ONLY on `v.qbo_vendor_id = bp.vendor_id`, so every uuid-shaped
 * bp.vendor_id silently failed to resolve. Live-measured: 0 of 6 USMCA bill_payments with a
 * vendor_id resolved a name (100% broken); 6543 of 6544 TRANSP rows resolved (the legacy path
 * worked there, since TRANSP payments use QBO id strings almost exclusively).
 *
 * FIX: all 4 sites now try `v.id::text = bp.vendor_id` first (the TMS-native case), falling back
 * to the legacy `v.qbo_vendor_id = bp.vendor_id` match -- the exact two-path pattern already
 * correct for accounting.bills.vendor_id/vendor_uuid elsewhere in this same file.
 *
 * Static check (always runs): all 4 known call sites still carry the two-path OR, and none
 * regressed to a bare qbo_vendor_id-only match.
 *
 * Live check (opt-in): every ACTIVE (non-revoked) bill_payment with a non-null vendor_id, in any
 * entity, resolves a vendor name -- catching a regression in either direction (TMS-native OR the
 * legacy QBO path).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-payments-vendor-resolves-tms-native";
const SERVICE_REL = "apps/backend/src/accounting/bills.service.ts";
const TWO_PATH_PATTERN = "v.id::text = bp.vendor_id OR v.qbo_vendor_id = bp.vendor_id";
const TWO_PATH_PATTERN_V2 = "v2.id::text = bp.vendor_id OR v2.qbo_vendor_id = bp.vendor_id";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertTwoPathResolution(serviceSource) {
  const errors = [];
  const v1Count = (serviceSource.match(new RegExp(TWO_PATH_PATTERN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  const v2Count = (serviceSource.match(new RegExp(TWO_PATH_PATTERN_V2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  // 3 sites alias the vendor row as `v` (shared constant + the 2 subqueries in listBillPayments),
  // 1 site (getBillPaymentDetail's LEFT JOIN) aliases it as `v2`.
  if (v1Count < 3) {
    errors.push(`only ${v1Count} of 3 expected 'v' two-path vendor resolutions found (bare qbo_vendor_id-only match regressed)`);
  }
  if (v2Count < 1) {
    errors.push(`the 'v2' two-path vendor resolution (getBillPaymentDetail) is missing`);
  }
  return errors;
}

function selftest() {
  const problems = [];
  const live = read(SERVICE_REL);

  const liveErrors = assertTwoPathResolution(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "all v two-path resolutions reverted to qbo_vendor_id-only",
      live.replace(new RegExp(TWO_PATH_PATTERN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "v.qbo_vendor_id = bp.vendor_id"),
      "qbo_vendor_id-only match regressed",
    ],
    [
      "v2 two-path resolution reverted",
      live.replace(TWO_PATH_PATTERN_V2, "v2.qbo_vendor_id = bp.vendor_id"),
      "getBillPaymentDetail) is missing",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertTwoPathResolution(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

async function liveScan() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    // Single multi-statement query — see ACCT-F5391: a pooled/transaction-pooling endpoint can hand
    // a separate client.query() call a different backend, silently dropping a bypass set in its own
    // call. SET + SELECT in one message guarantees one backend for both.
    const results = await client.query(
      `
        SELECT set_config('app.bypass_rls', 'lucia', true);
        SELECT bp.operating_company_id::text AS operating_company_id, count(*) AS unresolved
        FROM accounting.bill_payments bp
        WHERE bp.revoked_at IS NULL
          AND bp.vendor_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM mdata.vendors v
            WHERE v.operating_company_id = bp.operating_company_id
              AND (v.id::text = bp.vendor_id OR v.qbo_vendor_id = bp.vendor_id)
          )
        GROUP BY bp.operating_company_id
        HAVING count(*) > 0;
      `
    );
    const res = Array.isArray(results) ? results[results.length - 1] : results;

    if (res.rows.length > 0) {
      const rows = res.rows.map((row) => `${row.operating_company_id}: ${row.unresolved} unresolved`).join(", ");
      console.error(`${LABEL} FAILED\n- bill_payments with an unresolvable vendor_id: ${rows}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`${LABEL} — OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertTwoPathResolution(read(SERVICE_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  await liveScan();
}

main().catch((error) => {
  console.error(`${LABEL} FAILED\n- ${String(error?.message ?? error)}`);
  process.exit(1);
});
