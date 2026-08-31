/**
 * FAC-VOID-ENUM-2150: FAC-2026-00001 (id 87e6389a-970c-4342-8c5e-99a39f3ce8fd) is status='voided',
 * and its funding JE (09e5d7a9-...) was correctly reversed by that void (reversed_by_je_id set). But a
 * SEPARATE, later factoring_customer_payment JE (14d8718a-..., "customer_payment:120000@2026-09-15")
 * was posted against the SAME advance -- created 2026-08-29, one day BEFORE the void -- while the
 * advance was still in an earlier status. The void path this repo shipped (poster.service.ts
 * reverseFactoringAdvanceEventImpl, pre-fix) only ever looked up the hardcoded "funding" event_key, so
 * this customer-payment leg was never enumerated or reversed. Net effect: GL account 2150 (Factoring
 * Advance liability) carries a permanent, un-reversed Dr $1,200.00 for an advance that reads fully
 * voided.
 *
 * This is a one-time REPAIR for this single already-voided advance -- the code fix (poster.service.ts
 * findAllLifecyclePostingKeyJes) prevents this from recurring on any FUTURE void, but cannot retroactively
 * fix an advance that already went through the old, incomplete path (the void route itself refuses a
 * second void: factoring_advances status must be 'submitted'/'advanced', and this one is already
 * 'voided'). Reuses the exact same reverseJournalEntryNoFlip primitive the real void path uses -- no new
 * GL math invented, WORM (reversal JE only, original never flipped/deleted).
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-fac-void-enum-2150-repair-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-fac-void-enum-2150-repair-once.mts --commit  # apply
 */
import pg from "pg";
import { reverseJournalEntryNoFlip } from "../apps/backend/src/accounting/journal-entries.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ADVANCE_ID = "87e6389a-970c-4342-8c5e-99a39f3ce8fd"; // FAC-2026-00001
const ORPHAN_JE_ID = "14d8718a-3140-4b8a-a813-0b790d0fda4f"; // customer_payment:120000@2026-09-15
const REASON =
  "FAC-VOID-ENUM-2150 repair: this factoring_customer_payment JE (Dr 2150 Factoring Advance " +
  "$1,200.00 / Cr 1100 A/R $1,200.00) was posted against FAC-2026-00001 before that advance was " +
  "voided, but the old void path only reversed the hardcoded 'funding' leg and never enumerated this " +
  "one -- leaving a permanent un-reversed debit on a fully-voided advance. Reversed retroactively via " +
  "the same reverseJournalEntryNoFlip primitive the (now-fixed) void path uses. See " +
  "poster.service.ts findAllLifecyclePostingKeyJes for the code-level fix preventing recurrence.";

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

    // Pre-flight: confirm this is exactly the state the finding describes before mutating anything.
    const advCheck = await client.query(
      `SELECT status FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [ADVANCE_ID, USMCA]
    );
    if (advCheck.rows[0]?.status !== "voided") {
      throw new Error(`FAC-2026-00001 status is '${advCheck.rows[0]?.status}', expected 'voided' -- stopping, state has changed since this repair was written`);
    }
    const jeCheck = await client.query(
      `SELECT status, reversed_by_je_id FROM accounting.journal_entries WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [ORPHAN_JE_ID, USMCA]
    );
    if (!jeCheck.rows[0]) throw new Error(`orphan JE ${ORPHAN_JE_ID} not found`);
    if (jeCheck.rows[0].status !== "posted" || jeCheck.rows[0].reversed_by_je_id) {
      console.log(`Already reversed or not posted (status=${jeCheck.rows[0].status}, reversed_by_je_id=${jeCheck.rows[0].reversed_by_je_id}) -- nothing to do.`);
      await client.query("ROLLBACK");
      return;
    }

    const { reversal } = await reverseJournalEntryNoFlip(client, {
      operatingCompanyId: USMCA,
      journalEntryId: ORPHAN_JE_ID,
      reason: REASON,
      actorUserId: ACTOR_USER_UUID,
    });
    console.log(`Reversal JE: ${reversal.reversal_journal_entry_id}, date: ${reversal.reversal_date}, lines: ${reversal.reversed_line_count}`);

    if (!COMMIT) {
      console.log("DRY RUN -- rolling back. Pass --commit to apply.");
      await client.query("ROLLBACK");
      return;
    }
    await client.query("COMMIT");
    console.log("COMMITTED.");

    // Fresh, correctly bypass-scoped verification read after commit.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const verify = await client.query<{ net: string }>(
      `
        SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::text AS net
          FROM accounting.journal_entry_postings jep
          JOIN catalogs.accounts ca ON ca.id = jep.account_id
         WHERE ca.account_number = '2150'
           AND jep.journal_entry_uuid IN (
             SELECT journal_entry_id FROM accounting.factoring_lifecycle_posting_keys
              WHERE factoring_advance_id = $1::uuid
             UNION
             SELECT id FROM accounting.journal_entries WHERE reverses_je_id IN (
               SELECT journal_entry_id FROM accounting.factoring_lifecycle_posting_keys
                WHERE factoring_advance_id = $1::uuid
             )
           )
      `,
      [ADVANCE_ID]
    );
    await client.query("COMMIT");
    console.log(`VERIFY: net 2150 across all funding+reversal+payment+reversal legs for FAC-2026-00001 = ${verify.rows[0]?.net} (expect 0)`);
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
