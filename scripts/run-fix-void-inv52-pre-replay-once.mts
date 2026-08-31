/**
 * HUMAN-SEQUENCE-REPLAY (docs/lockdown/Coders-Faro/CC-1/CC-1-HUMAN-SEQUENCE-REPLAY.txt) rule 1:
 * "GO THROUGH THE APP. No bulk SQL insert. No seed script." run-task6-faro-33-invoices-once.mts
 * (this session, before the replay started) created INV-2026-00052 (id a1986396-130a-41a4-acfd-
 * ae9d8e90de4d, Watco Supply Chain Services LLC DBA Watco Logistics, $1,700.00, draft, PO 2239480)
 * via raw SQL -- this is exactly load 13512 / Faro invoice 004, the human-replay's own chosen
 * specimen. Leaving it in place would make step 5 of the 12-step replay a no-op instead of a real
 * UI-driven test.
 *
 * WORM: void it (do not delete), then step 5 recreates the same invoice live, through the real
 * product UI, once the load exists and is delivered. Still status='draft', never sent/posted, so
 * (same as the invoice-016 fix) postVoidReversal finds no GL postings to reverse -- a safe, pure
 * status flip.
 *
 * Also note for the record (not fixed here, out of scope): a SECOND, unrelated invoice
 * (47f27f7e-6b5c-4c60-8966-4bfccf1bc285, different customer, $4,600.00, status='paid') shares the
 * exact same display_id 'INV-2026-00052' -- a display_id collision worth its own investigation,
 * flagged in the OUTBOX report, not touched by this script.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-void-inv52-pre-replay-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-void-inv52-pre-replay-once.mts --commit  # apply
 */
import pg from "pg";
import { isVoidEnforcementEnabled, postVoidReversal, auditVoid, pgDateColumnToIsoDay } from "../apps/backend/src/accounting/void.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const INVOICE_ID = "a1986396-130a-41a4-acfd-ae9d8e90de4d"; // INV-2026-00052, Watco, $1,700, row 004
const VOID_REASON =
  "HUMAN-SEQUENCE-REPLAY rule 1 (no bulk SQL insert): this invoice (load 13512 / Faro 004) was " +
  "created by run-task6-faro-33-invoices-once.mts before the replay started. Voided so step 5 of " +
  "the 12-step replay can create it fresh through the real product UI, matching the owner's " +
  "explicit test. Not recreated by this script.";

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const cur = await client.query(
      `SELECT id, display_id, status, total_cents, issue_date::text AS issue_date_iso, voided_at
         FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [INVOICE_ID, USMCA]
    );
    const row = cur.rows[0];
    if (!row) throw new Error(`invoice ${INVOICE_ID} not found under USMCA`);
    console.log(`FOUND: ${row.display_id} status=${row.status} total_cents=${row.total_cents} voided_at=${row.voided_at}`);
    if (row.status === "void" || row.voided_at) {
      console.log("Already void -- nothing to do.");
      await client.query("ROLLBACK");
      return;
    }
    if (row.status === "paid") throw new Error("invoice is paid -- cannot void, escalate instead");

    const flagOn = await isVoidEnforcementEnabled(client, USMCA, ACTOR_USER_UUID);
    console.log(`VOID-EVERYWHERE flag: ${flagOn}`);

    const reversal = flagOn
      ? await postVoidReversal(
          client,
          {
            operatingCompanyId: USMCA,
            entityType: "invoice",
            entityId: INVOICE_ID,
            originalDate: pgDateColumnToIsoDay(row.issue_date_iso),
            memo: `Void reversal of invoice ${INVOICE_ID}: ${VOID_REASON}`,
          },
          { userId: ACTOR_USER_UUID }
        )
      : { reversal_journal_entry_id: null, reversal_date: null, closed_period_reversal: false, reversed_line_count: 0 };
    console.log(`postVoidReversal result: ${JSON.stringify(reversal)}`);
    if (reversal.reversed_line_count !== 0) {
      throw new Error(
        `UNEXPECTED: this draft invoice had ${reversal.reversed_line_count} GL line(s) to reverse -- ` +
          `expected 0 (never sent/posted). Stopping before mutating further; investigate before rerunning.`
      );
    }

    await client.query(
      `UPDATE accounting.invoices
          SET status = 'void', voided_at = now(), void_reason = $2, updated_at = now(), updated_by_user_id = $3
        WHERE id = $1`,
      [INVOICE_ID, VOID_REASON, ACTOR_USER_UUID]
    );

    if (flagOn) {
      await auditVoid(client, ACTOR_USER_UUID, "invoice", {
        operatingCompanyId: USMCA,
        entityId: INVOICE_ID,
        reason: VOID_REASON,
        reversal,
      });
    }

    if (!COMMIT) {
      console.log("DRY RUN -- rolling back. Pass --commit to apply.");
      await client.query("ROLLBACK");
      return;
    }
    await client.query("COMMIT");
    console.log(`VOIDED: ${row.display_id} (${INVOICE_ID})`);

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const verify = await client.query(`SELECT status, voided_at FROM accounting.invoices WHERE id = $1`, [INVOICE_ID]);
    await client.query("COMMIT");
    console.log(`VERIFY: status=${verify.rows[0]?.status} voided_at=${verify.rows[0]?.voided_at}`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
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
