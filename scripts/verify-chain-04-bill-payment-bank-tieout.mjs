#!/usr/bin/env node
/**
 * verify-chain-04-bill-payment-bank-tieout.mjs
 *
 * CHAIN-04 — read-only tie-out proof: accounting.bills -> accounting.bill_payments ->
 * banking.bank_transactions must reconcile to the penny. See
 * docs/specs/qbo-parity/CHAIN-04-BANK-TIEOUT-PROOF.md for the full design + the "Part 2b" accept-bill
 * write path this proof is the evidence gate for (NOT built by this script/PR).
 *
 * GROUNDED (live schema, verified against db/migrations/0073, 0090, 0182, 202607011600):
 *   accounting.bills: amount_cents, paid_cents, status (plain text, no CHECK), revoked_at (no voided_at).
 *   accounting.bill_payments: bill_id (FK NOT NULL), amount_cents, revoked_at.
 *   banking.bank_transactions: amount_cents (Plaid-signed), is_credit (bool), matched_bill_payment_id.
 *
 * ASSERTIONS (entity-agnostic — every query is already scoped by the FK graph, never cross-entity):
 *   A — bill.paid_cents must equal the live SUM of its own non-revoked bill_payments (subledger tie-out,
 *       independent of the bank; this must hold even before any bank match exists).
 *   B — a bill_payment matched to a bank_transaction (via matched_bill_payment_id) must have the SAME
 *       amount_cents (to the penny) and the bank line must be a withdrawal (is_credit = false).
 *   C — bijection: a bank_transaction must not claim more than one bill_payment (matched_bill_payment_id
 *       is 1:1); the FK/column shape already prevents the reverse (one bill_payment -> many bank lines)
 *       from being ambiguous since bank_transactions.matched_bill_payment_id is the only pointer, but a
 *       duplicate bill_payment_id across bank_transactions rows would still be a defect, so it is checked.
 *
 * Informational-only (never fails the guard): bill_payments funded from a bank account but with no bank
 * line linked yet — expected today since the write path (Part 2b) that would create that link is not
 * built. Becomes a real orphan-write check once Part 2b ships.
 *
 * MODE: ADVISORY by default (lists violations, exit 0). CHAIN_04_TIEOUT_ENFORCE=true -> blocking (exit 1).
 * DEGRADE-SAFE: no DATABASE_URL -> skip with a warning and exit 0 — never crash CI.
 * Read-only. Never repairs a row — a human fixes drift via a new, reviewed entry (void-not-delete).
 */

import process from "node:process";

const ENFORCE = process.env.CHAIN_04_TIEOUT_ENFORCE === "true";

/** Single-source assertion SQL. */
export const ASSERTIONS = {
  legA_billVsPaymentsDrift: `
    SELECT b.id AS bill_id, b.operating_company_id, b.paid_cents AS bill_paid_cents,
           COALESCE(SUM(bp.amount_cents), 0)::bigint AS payments_sum_cents
      FROM accounting.bills b
      LEFT JOIN accounting.bill_payments bp
        ON bp.bill_id = b.id AND bp.revoked_at IS NULL
     WHERE b.revoked_at IS NULL
     GROUP BY b.id, b.operating_company_id, b.paid_cents
    HAVING b.paid_cents <> COALESCE(SUM(bp.amount_cents), 0)`,
  legB_amountOrDirectionMismatch: `
    SELECT bt.id AS bank_transaction_id, bp.id AS bill_payment_id,
           bt.amount_cents AS bank_amount_cents, bp.amount_cents AS payment_amount_cents, bt.is_credit
      FROM banking.bank_transactions bt
      JOIN accounting.bill_payments bp ON bp.id = bt.matched_bill_payment_id
     WHERE bp.revoked_at IS NULL
       AND (ABS(bt.amount_cents) <> bp.amount_cents OR bt.is_credit = true)`,
  legC_duplicateBankClaim: `
    SELECT matched_bill_payment_id, COUNT(*) AS bank_lines_claiming_it
      FROM banking.bank_transactions
     WHERE matched_bill_payment_id IS NOT NULL
     GROUP BY matched_bill_payment_id
    HAVING COUNT(*) > 1`,
};

/** Informational only — never fails the guard. */
export const INFORMATIONAL = {
  unmatchedBankFundedPayments: `
    SELECT bp.id, bp.operating_company_id, bp.amount_cents, bp.payment_method, bp.from_bank_account_id
      FROM accounting.bill_payments bp
     WHERE bp.revoked_at IS NULL
       AND bp.from_bank_account_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM banking.bank_transactions bt WHERE bt.matched_bill_payment_id = bp.id
       )`,
};

async function main() {
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    console.warn("[chain-04-tieout] no DATABASE_URL — skipping (advisory). Run against a local/CI/Neon-branch DB for the real proof.");
    process.exit(0);
  }

  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: cs, max: 2 });

  try {
    const violations = {};
    for (const [name, sql] of Object.entries(ASSERTIONS)) {
      const r = await pool.query(sql);
      if (r.rows.length) violations[name] = r.rows;
    }

    const info = {};
    for (const [name, sql] of Object.entries(INFORMATIONAL)) {
      const r = await pool.query(sql);
      if (r.rows.length) info[name] = r.rows;
    }

    if (Object.keys(info).length) {
      console.log("\n[chain-04-tieout] INFORMATIONAL (not a failure):");
      for (const [name, rows] of Object.entries(info)) {
        console.log(`  [${name}] ${rows.length} row(s) — expected until Part 2b ships (see CHAIN-04-BANK-TIEOUT-PROOF.md §5).`);
      }
    }

    const total = Object.values(violations).reduce((n, rows) => n + rows.length, 0);
    if (total === 0) {
      console.log("[chain-04-tieout] PASS — bills <-> bill_payments <-> bank_transactions tie out to the penny.");
      process.exit(0);
    }

    const header = ENFORCE ? "CHAIN-04 TIE-OUT GUARD FAILED" : "CHAIN-04 TIE-OUT — ADVISORY (not blocking)";
    console.error(`\n${header}`);
    console.error("=".repeat(64));
    for (const [name, rows] of Object.entries(violations)) {
      console.error(`  [${name}] ${rows.length} violation(s):`);
      for (const row of rows.slice(0, 25)) console.error(`     ${JSON.stringify(row)}`);
      if (rows.length > 25) console.error(`     … +${rows.length - 25} more`);
    }
    console.error("=".repeat(64));
    console.error("Drift is fixed by a human via a new, reviewed bill_payment/JE — this guard DETECTS only.");

    process.exit(ENFORCE ? 1 : 0);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[chain-04-tieout] error:", e?.message ?? e);
  process.exit(ENFORCE ? 1 : 0);
});
