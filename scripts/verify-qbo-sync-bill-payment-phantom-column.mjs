#!/usr/bin/env node
/**
 * LV-QBO-SYNC-BILL-PAYMENT-PHANTOM-BILL-NUMBER — static ratchet.
 *
 * apps/backend/src/integrations/qbo/qbo-sync.service.ts's sync-queue display_id CASE statement had a
 * WHEN 'bill_payment' THEN bp.bill_number branch. accounting.bill_payments has no bill_number column
 * (verified against prod information_schema) — every sibling branch reads its own table's real
 * identity column (b.display_id, e.expense_number, i.display_id, p.display_id, fa.display_id,
 * s.display_id, vc.display_id), but this one referenced a column that never existed. Live-verified:
 * a SELECT hitting this branch would throw "column bp.bill_number does not exist" — not firing on prod
 * only because QBO write-back is OFF by owner law, not because the query is correct.
 *
 * This was the 1 genuine defect `verify:sql-read-targets` (verify-step 12b) found among 70 flagged
 * entries; the other 69 were guard false-positives. Repairing that general guard's CASE-statement
 * parsing is a separate, larger project — this is a narrow, targeted ratchet scoped to the ONE real
 * defect, so a regression of this specific column reference is caught without waiting on that repair.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): the sync-queue
 * display_id query's `WHEN 'bill_payment' THEN` branch must reference a column that actually exists on
 * accounting.bill_payments per this repo's own migration history — not bill_number or display_id,
 * neither of which that table has ever carried.
 *
 * Self-test: node scripts/verify-qbo-sync-bill-payment-phantom-column.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-qbo-sync-bill-payment-phantom-column";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/integrations/qbo/qbo-sync.service.ts";

// accounting.bill_payments columns, per prod information_schema (verified 2026-08-12) and the
// migrations that created/altered the table. Kept as an explicit allowlist rather than a live DB
// check so this guard runs in every context including fresh-DB CI with no database reachable.
const BILL_PAYMENTS_COLUMNS = new Set([
  "id",
  "operating_company_id",
  "bill_id",
  "vendor_id",
  "payment_date",
  "amount_cents",
  "amount",
  "payment_method",
  "from_bank_account_id",
  "check_number",
  "reference_number",
  "memo",
  "qbo_bill_payment_id",
  "advance_id",
  "status",
  "created_by_user_id",
  "created_at",
  "updated_at",
  "revoked_at",
  "revoked_by_user_id",
  "revoked_reason",
  "payment_batch_id",
  "payment_source_kind",
  "source_bank_transaction_id",
  "source_system",
  "last_qbo_synced_at",
  "version_int",
  "qbo_idempotency_key",
  "qbo_sync_token",
  "cc_account_id",
  "settlement_deduction_noncash",
  "is_sample_data",
]);

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

/**
 * Finds the `WHEN 'bill_payment' THEN <alias>.<column>` branch and checks the column against the
 * known real columns of accounting.bill_payments. Returns null if the branch isn't found at all
 * (guard would be inert — treated as a failure by the caller, same completeness-discriminator law as
 * everywhere else in this repo).
 */
export function checkBillPaymentBranch(src) {
  const code = stripComments(src);
  const m = /WHEN\s+'bill_payment'\s+THEN\s+(\w+)\.(\w+)/i.exec(code);
  if (!m) return { ok: false, reason: "no WHEN 'bill_payment' THEN <alias>.<column> branch found" };
  const [, , column] = m;
  if (!BILL_PAYMENTS_COLUMNS.has(column)) {
    return { ok: false, reason: `references accounting.bill_payments.${column}, which does not exist on that table` };
  }
  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    CASE q.entity_type
      WHEN 'bill' THEN b.display_id
      WHEN 'bill_payment' THEN bp.reference_number
      ELSE NULL
    END
  `;
  const goodResult = checkBillPaymentBranch(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
    CASE q.entity_type
      WHEN 'bill' THEN b.display_id
      WHEN 'bill_payment' THEN bp.bill_number
      ELSE NULL
    END
  `;
  const regressedResult = checkBillPaymentBranch(regressed);
  if (regressedResult.ok) fail("selftest: regressed fixture (phantom bill_number column) should FAIL but passed");

  const commentTrap = `
    CASE q.entity_type
      -- bp.reference_number is the fix; do not use bp.bill_number, it does not exist
      WHEN 'bill_payment' THEN bp.bill_number
      ELSE NULL
    END
  `;
  const trapResult = checkBillPaymentBranch(commentTrap);
  if (trapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  const missing = `CASE q.entity_type WHEN 'bill' THEN b.display_id ELSE NULL END`;
  const missingResult = checkBillPaymentBranch(missing);
  if (missingResult.ok) fail("selftest: missing-branch fixture should FAIL but passed");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap/missing fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkBillPaymentBranch(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — the bill_payment sync-queue display_id branch references a real accounting.bill_payments column`);
}
