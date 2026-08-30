/**
 * ACCT-F10129 follow-up — WORM reversal of FAC-2026-00001, the one live USMCA factoring advance
 * that was created under the old (now-fixed) reserve/fee bug: reserve_amount_cents=5550 (should be
 * 2775), factor_fee_cents=0 (should be 2775). Never UPDATE/delete the row -- reverse it, exactly the
 * same mechanism the existing POST /:id/void route uses (reverseFactoringAdvanceEvent ->
 * reverseJournalEntryNoFlip), reused here directly since this is a one-time prod remediation, not a
 * live authenticated HTTP session.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-acct-f10129-reverse-fac-2026-00001-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-acct-f10129-reverse-fac-2026-00001-once.mts --commit  # apply
 */
import pg from "pg";
import { reverseFactoringAdvanceEvent } from "../apps/backend/src/accounting/factoring-posting/poster.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ADVANCE_ID = "87e6389a-970c-4342-8c5e-99a39f3ce8fd"; // FAC-2026-00001
const REASON = "ACCT-F10129: reserve/fee were folded into one wrong number (reserve=5550 should be 2775, fee=0 should be 2775) by the pre-fix formula. Reversed under WORM; a correctly-priced replacement advance is a separate, later submission, not this reversal.";

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function liabilityAccountBalance(client: pg.PoolClient, accountId: string) {
  const res = await client.query<{ debits: string; credits: string }>(
    `
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit = 'debit'), 0)::text AS debits,
        COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit = 'credit'), 0)::text AS credits
      FROM accounting.journal_entry_postings
      WHERE account_id = $1::uuid
    `,
    [accountId]
  );
  return res.rows[0];
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const before = await client.query(
      `SELECT status, reserve_amount_cents, factor_fee_cents, invoice_total_cents FROM accounting.factoring_advances WHERE id = $1::uuid`,
      [ADVANCE_ID]
    );
    console.log("BEFORE:", before.rows[0]);

    const liabilityAccountRes = await client.query<{ account_id: string }>(
      `SELECT DISTINCT account_id::text FROM accounting.journal_entry_postings WHERE source_transaction_type = 'factoring_advance' AND source_transaction_id = $1 AND debit_or_credit = 'credit'`,
      [ADVANCE_ID]
    );
    const liabilityAccountId = liabilityAccountRes.rows[0]?.account_id;
    if (liabilityAccountId) {
      console.log("BEFORE liability account balance:", await liabilityAccountBalance(client, liabilityAccountId));
    }

    const paymentRes = await client.query(
      `SELECT DISTINCT journal_entry_uuid::text FROM accounting.journal_entry_postings WHERE source_transaction_type = 'factoring_customer_payment' AND source_transaction_id = $1`,
      [ADVANCE_ID]
    );
    if (paymentRes.rows.length > 0) {
      console.log(
        "NOTE: a factoring_customer_payment JE already references this advance:",
        paymentRes.rows.map((r) => r.journal_entry_uuid),
        "-- this reversal does NOT touch it (not asked). After reversal, the liability account will show a negative balance until a correctly-priced replacement advance is submitted and this payment (or its equivalent) is reapplied. Flagging, not deciding."
      );
    }

    if (!COMMIT) {
      console.log("DRY RUN -- pass --commit to apply. No writes made.");
      return;
    }

    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

      const reversal = await reverseFactoringAdvanceEvent({
        operating_company_id: USMCA,
        factoring_advance_id: ADVANCE_ID,
        actor_user_id: ACTOR_USER_UUID,
        reason: REASON,
      });
      console.log("REVERSAL RESULT:", reversal);
      if (!reversal.reversed) throw new Error(`reversal_failed: ${reversal.reason}`);

      // Mirrors POST /:id/void exactly: status -> voided, unlink the invoice.
      await client.query(
        `UPDATE accounting.factoring_advances SET status = 'voided', notes = COALESCE(notes, '') || $2 WHERE id = $1::uuid`,
        [ADVANCE_ID, `\n${REASON}`]
      );
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'not_factored',
              factoring_advance_id = NULL,
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [ADVANCE_ID, ACTOR_USER_UUID]
      );
      await client.query(
        `SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`,
        [
          "accounting.factoring_voided",
          "warning",
          JSON.stringify({
            resource_type: "accounting.factoring_advances",
            resource_id: ADVANCE_ID,
            operating_company_id: USMCA,
            reason: REASON,
            gl_reversed: reversal.reversed,
            reversal_journal_entry_id: reversal.reversed ? reversal.reversal_journal_entry_id : null,
          }),
          ACTOR_USER_UUID,
          "ACCT-F10129-RECON-VOID",
        ]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const after = await client.query(
      `SELECT status, reserve_amount_cents, factor_fee_cents FROM accounting.factoring_advances WHERE id = $1::uuid`,
      [ADVANCE_ID]
    );
    console.log("AFTER:", after.rows[0]);
    if (liabilityAccountId) {
      console.log("AFTER liability account balance:", await liabilityAccountBalance(client, liabilityAccountId));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
