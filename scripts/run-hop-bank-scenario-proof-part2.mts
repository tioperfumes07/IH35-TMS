/**
 * Continuation of run-hop-bank-scenario-proof-once.mts: the first bank transaction landed on a
 * bank account (USMCA FREIGHT) whose August 2026 banking.reconciliation_sessions row is
 * status='reconciled' (closed) — banking.trg_block_reconciled_session_txn_mutation correctly
 * refused to mutate it (and refused to delete the stray unmatched row afterward; left in place,
 * harmless, clearly labeled TEST DATA, matched_* still NULL). Retrying on the OTHER active USMCA
 * bank account (Relay Fuel Wallet), which has ZERO reconciliation_sessions rows at all — no
 * closed-period collision. Reuses the SAME already-created, already-posted TEST payment.
 */
import pg from "pg";
import { acceptReconMatch } from "../apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PAYMENT_ID = "f2299270-bf98-4d02-8e7f-d4b28de9012a"; // PMT-2026-00010, already applied+posted
const AMOUNT_CENTS = 120000;
const BANK_ACCOUNT_ID = "809fcfbb-738e-471c-8fc1-a38f0f9b814a"; // "Relay Fuel Wallet" — no recon sessions

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("RESET ROLE");
  const todayIso = new Date().toISOString().slice(0, 10);

  const bankTxnRes = await client.query<{ id: string }>(
    `
      INSERT INTO banking.bank_transactions (
        bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit,
        description, source
      ) VALUES ($1,$2,$3,$4,true,$5,'manual_test')
      RETURNING id
    `,
    [BANK_ACCOUNT_ID, USMCA, todayIso, AMOUNT_CENTS, "TEST DATA - hop.bank scenario proof (ACCT-F5620 re-verify)"]
  );
  const bankTransactionId = bankTxnRes.rows[0].id;
  console.log(`bank transaction created: ${bankTransactionId}`);

  const result = await acceptReconMatch({
    operating_company_id: USMCA,
    bank_transaction_id: bankTransactionId,
    actor_user_uuid: ACTOR_USER_ID,
    ledger_entry_kind: "payment",
    ledger_entry_id: PAYMENT_ID,
  });
  console.log("acceptReconMatch result:", JSON.stringify(result));

  const verify = await client.query(
    `SELECT id, matched_invoice_id, matched_payment_id, review_state, is_credit
       FROM banking.bank_transactions WHERE id = $1`,
    [bankTransactionId]
  );
  console.log("LIVE PROOF:", JSON.stringify(verify.rows[0], null, 2));
} finally {
  client.release();
  await pool.end();
}
