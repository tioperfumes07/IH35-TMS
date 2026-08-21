/**
 * ACCT-F5705 — proves the fix live: a real USMCA customer payment with ZERO invoice applications
 * (a customer credit / unapplied cash — a real, UI-supported outcome, CustomerDetail.tsx's
 * creditBalanceCents flow) now attempts a real GL post via the EXISTING, unchanged
 * postSourceTransactionInClientTx poster, matching the real POST /api/v1/customers/:id/payments
 * route's own INSERT + posting shape exactly (mirrored here since the route requires a live Fastify
 * server; this replays the same SQL + poster call the fixed route now runs).
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-acct-f5705-zero-application-payment-once.mts          # dry run
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-acct-f5705-zero-application-payment-once.mts --commit  # apply
 */
import pg from "pg";
import { postSourceTransactionInClientTx } from "../apps/backend/src/accounting/posting-engine.service.js";
import { nextPaymentDisplayId } from "../apps/backend/src/accounting/display-id.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const CUSTOMER_ID = "ae1a4203-40bb-4908-b566-a7024a35024d"; // real active USMCA customer "TC Freight LLC"
const AMOUNT_CENTS = 50000; // $500.00 TEST DATA customer credit (zero applications)

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");
if (/-pooler\./.test(dbUrl)) {
  throw new Error("Refusing a pooled connection string.");
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    const customer = await client.query(`SELECT id, customer_name FROM mdata.customers WHERE id = $1::uuid`, [CUSTOMER_ID]);
    console.log("BEFORE — target customer:", customer.rows[0]);

    if (!COMMIT) {
      console.log("DRY RUN — pass --commit to apply. No writes made.");
      return;
    }

    // NOTE: the real route wraps its whole handler in withCompanyScope -> withCurrentUser, which does
    // BEGIN...COMMIT around the callback, so both the RLS/company-scope GUCs (is_local=true) and the
    // posting engine's deferred balance-check trigger are scoped to that ONE transaction. A raw
    // pg.Pool client autocommits per statement -- BEGIN must come first or the is_local GUCs expire
    // after their own statement and the deferred trigger fires (falsely) after just the first line.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    // Mirror resolveRoleAccountOptional's undeposited_funds -> cash_clearing fallback the real route
    // uses when no bank_account_id is supplied.
    const depositRes = await client.query(
      `
        SELECT account_id::text FROM accounting.chart_of_accounts_roles
        WHERE operating_company_id = $1::uuid AND role IN ('undeposited_funds','cash_clearing')
        ORDER BY (role = 'undeposited_funds') DESC
        LIMIT 1
      `,
      [USMCA]
    );
    const depositedToAccountId = depositRes.rows[0]?.account_id;
    if (!depositedToAccountId) throw new Error("no undeposited_funds/cash_clearing role bound for USMCA");

    const displayId = await nextPaymentDisplayId(client, USMCA, new Date());

    const paymentRes = await client.query(
      `
        INSERT INTO accounting.payments (
          operating_company_id, customer_id, display_id, payment_method, payment_date, reference,
          amount_cents, deposited_to_account_id, notes, created_by_user_id, payment_source_kind,
          source_bank_transaction_id, is_sample_data
        )
        VALUES ($1,$2,$3,'ach',CURRENT_DATE,$4,$5,$6,$7,$8,'manual',NULL,true)
        RETURNING id, display_id, amount_unapplied_cents
      `,
      [
        USMCA,
        CUSTOMER_ID,
        displayId,
        "ACCT-F5705 TEST",
        AMOUNT_CENTS,
        depositedToAccountId,
        "WAVE3_TEST_DATA_2026-08-21 -- CC-1 ACCT-F5705 proof-of-path: zero-application customer credit",
        ACTOR_USER_UUID,
      ]
    );
    const payment = paymentRes.rows[0];
    if (!payment?.id) throw new Error("payment_insert_failed");
    console.log("PAYMENT CREATED (zero applications):", payment);

    // Mirrors the fixed route exactly: no applicationsCount gate, just the flag.
    await postSourceTransactionInClientTx(
      client,
      {
        operating_company_id: USMCA,
        source_transaction_type: "customer_payment",
        source_transaction_id: payment.id,
        posting_purpose: "initial_post",
      },
      { userId: ACTOR_USER_UUID }
    );

    const je = await client.query(
      `
        SELECT je.id, je.is_sample_data, je.memo, p.account_id::text, ca.account_name, p.debit_or_credit, p.amount_cents
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
        JOIN catalogs.accounts ca ON ca.id = p.account_id
        WHERE p.source_transaction_type = 'customer_payment' AND p.source_transaction_id = $1
        ORDER BY p.line_sequence
      `,
      [payment.id]
    );
    console.log("JE POSTINGS (zero-application payment, should now be real and balanced):", je.rows);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
