/**
 * hop.bank scenario proof (ACCT-F5620, re-verified live 2026-08-26) — the "bank path" USMCA
 * scenario probe (apps/backend/src/home/scenario-registry.ts, key "hop.bank") measures
 * `count(*) FROM banking.bank_transactions WHERE matched_invoice_id IS NOT NULL AND is_credit
 * = true`. Prior board history (ACCT-F5620, PR #10881, 3 re-applies after 2 confirmed silent
 * reverts) shows the code fix (match.service.ts's acceptMatchWithResolveDifference, "payment"
 * branch re-attempting backlinkBankTransactionToInvoice) is live on main, but the ONE historical
 * USMCA row that was matched-to-payment (bank_transaction f3e3ced5-..., payment a22143c1-...)
 * predates the fix and is explicitly "No mass backfill — new accepts only" (match.service.ts's
 * own comment) — it can never retroactively go green. The probe needs a FRESH accept-match
 * cycle to prove the fix works going forward, per docs/lockdown/CREATE-TEST-THEN-VOID-LAW-
 * 2026-08-22 ("create the test... exercisable now").
 *
 * This script performs EXACTLY what a human operator does through the real UI/API, using the
 * SAME service-layer functions the routes call — no new match/posting logic:
 *   1. Record a TEST customer payment applied in full to an existing open USMCA invoice
 *      (mirrors POST /api/v1/accounting/payments's own INSERT + payment_applications + gated
 *      GL post, verbatim).
 *   2. Insert a TEST bank transaction (the "ingest" step — mirrors what a real bank-feed row
 *      looks like; there is no synthetic-match logic here, just a labeled TEST row).
 *   3. Call the REAL acceptReconMatch (bank-recon/recon-worklist.service.ts), the same function
 *      POST /api/v1/accounting/reconciliation & bank-recon/recon-worklist.routes.ts's accept
 *      route calls, with ledger_entry_kind: "payment" — the exact path ACCT-F5620 fixed.
 *   4. Read the bank transaction back and print matched_invoice_id/matched_payment_id/
 *      review_state as live proof.
 *
 * TEST DATA is labeled in every row's notes/description per the standing law. Left live (not
 * voided) — matching this repo's established practice of leaving labeled TEST financial rows in
 * place until a dedicated launch-readiness void pass, not voiding immediately after each proof.
 *
 * Usage: DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-hop-bank-scenario-proof-once.mts
 */
import pg from "pg";
import { nextPaymentDisplayId } from "../apps/backend/src/accounting/display-id.ts";
import { resolveRoleAccountOptional } from "../apps/backend/src/accounting/coa-roles/resolver.service.ts";
import { postSourceTransactionInClientTx } from "../apps/backend/src/accounting/posting-engine.service.ts";
import { isEnabled } from "../apps/backend/src/lib/feature-flags/service.ts";
import { acceptReconMatch } from "../apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // Owner role, USMCA-accessible
const INVOICE_ID = "9d353a56-86b9-4e52-b1b3-e6608fb1c0fc"; // INV-2026-00045, sent, amount_open_cents=120000
const CUSTOMER_ID = "8327b3cb-b400-44c9-ab0e-1306f74537db";
const AMOUNT_CENTS = 120000;
const BANK_ACCOUNT_ID = "e83028a5-dcda-4233-b660-5b9923b3d39c"; // "USMCA FREIGHT", active, non-credit

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("RESET ROLE");
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const displayId = await nextPaymentDisplayId(client as never, USMCA, new Date());
  const depositedToAccountId =
    (await resolveRoleAccountOptional(client as never, USMCA, "undeposited_funds")) ??
    (await resolveRoleAccountOptional(client as never, USMCA, "cash_clearing"));
  if (!depositedToAccountId) throw new Error("no undeposited_funds/cash_clearing account resolved for USMCA");

  const paymentRes = await client.query<{ id: string; display_id: string }>(
    `
      INSERT INTO accounting.payments (
        operating_company_id, customer_id, display_id, payment_method, payment_date,
        reference, amount_cents, deposited_to_account_id, notes, created_by_user_id, is_sample_data
      ) VALUES ($1,$2,$3,'ach',$4,$5,$6,$7,$8,$9,true)
      RETURNING id, display_id
    `,
    [USMCA, CUSTOMER_ID, displayId, todayIso, "TEST-HOPBANK", AMOUNT_CENTS, depositedToAccountId, "TEST DATA - hop.bank scenario proof (ACCT-F5620 re-verify)", ACTOR_USER_ID]
  );
  const paymentId = paymentRes.rows[0].id;
  console.log(`payment created: ${paymentRes.rows[0].display_id} (${paymentId})`);

  await client.query(
    `
      INSERT INTO accounting.payment_applications (
        operating_company_id, payment_id, invoice_id, target_kind, target_id,
        amount_cents, amount_applied, applied_by_user_id, applied_by_user_uuid
      ) VALUES ($1,$2,$3,'invoice',$3,$4,$5,$6,$6)
    `,
    [USMCA, paymentId, INVOICE_ID, AMOUNT_CENTS, AMOUNT_CENTS / 100, ACTOR_USER_ID]
  );
  console.log(`payment applied to invoice ${INVOICE_ID} for ${AMOUNT_CENTS} cents`);

  const customerPaymentPostingEnabled = await isEnabled(client as never, "CUSTOMER_PAYMENT_GL_POSTING_ENABLED", {
    operating_company_id: USMCA,
    user_uuid: ACTOR_USER_ID,
  });
  if (customerPaymentPostingEnabled) {
    const posting = await postSourceTransactionInClientTx(
      client as never,
      { operating_company_id: USMCA, source_transaction_type: "customer_payment", source_transaction_id: paymentId },
      { userId: ACTOR_USER_ID }
    );
    console.log(`payment posted to GL: journal_entry_id=${posting.journal_entry_id}`);
  } else {
    console.log("CUSTOMER_PAYMENT_GL_POSTING_ENABLED is OFF for USMCA — payment recorded unposted (matches route behavior)");
  }

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

  await client.query("COMMIT");

  // acceptReconMatch opens its OWN lucia-bypass connection (withLuciaBypass inside
  // acceptMatchWithResolveDifference) — must run AFTER the create transaction commits, exactly
  // like a real user clicking Accept on an already-ingested, already-existing bank line.
  const result = await acceptReconMatch({
    operating_company_id: USMCA,
    bank_transaction_id: bankTransactionId,
    actor_user_uuid: ACTOR_USER_ID,
    ledger_entry_kind: "payment",
    ledger_entry_id: paymentId,
  });
  console.log("acceptReconMatch result:", JSON.stringify(result));

  const verify = await client.query(
    `SELECT id, matched_invoice_id, matched_payment_id, review_state, is_credit
       FROM banking.bank_transactions WHERE id = $1`,
    [bankTransactionId]
  );
  console.log("LIVE PROOF:", JSON.stringify(verify.rows[0], null, 2));
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  throw err;
} finally {
  client.release();
  await pool.end();
}
