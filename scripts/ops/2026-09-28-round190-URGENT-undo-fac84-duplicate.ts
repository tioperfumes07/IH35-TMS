/**
 * URGENT CORRECTION — the ROUND 190 repost script incorrectly posted a NEW funding JE for
 * FAC-2026-00084 (je funding#rev1 = 667a78bc-b869-4367-8a5c-011b3d98defc), not realizing that
 * FAC-2026-00091 is the ALREADY-CORRECT, ALREADY-LIVE twin of the exact same real Faro invoice
 * (inv 46, load 13563, $600 purchase, $582.00 net advance) -- created during an earlier,
 * untracked repair session on 2026-09-24. This created a real, live duplicate GL entry.
 *
 * This reverses that one erroneous JE via the SAME sanctioned engine
 * (reverseFactoringAdvanceEventInClientTx) and restores FAC-2026-00084's header to a safe,
 * clearly-voided state -- honest about what happened (never fabricating the original
 * voided_at timestamp, which this script did not capture before overwriting it).
 */
import pg from "pg";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const FAC_84_ID = "5e38e177-02b5-4d39-841c-b7492781eb9f";

async function main() {
  const { reverseFactoringAdvanceEventInClientTx } = await import(
    "../../apps/backend/src/accounting/factoring-posting/poster.service.js"
  );
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

    const result = await reverseFactoringAdvanceEventInClientTx(client, {
      operating_company_id: USMCA_ID,
      factoring_advance_id: FAC_84_ID,
      actor_user_id: SYSTEM_ACTOR_USER_ID,
      reason: "ROUND 190 self-correction: FAC-2026-00091 is the already-correct, already-live twin of this exact real Faro invoice (inv 46, load 13563) from an earlier repair session. The ROUND 190 repost script incorrectly created a duplicate funding JE here before this was discovered. Reversing to eliminate the duplicate GL entry; real economics remain correctly recorded under FAC-2026-00091.",
    });
    if (!result.reversed) {
      throw new Error(`reversal failed: ${JSON.stringify(result)}`);
    }
    console.log("Reversed:", JSON.stringify(result));

    await client.query(
      `UPDATE accounting.factoring_advances
          SET status = 'voided', voided_at = now(), voided_by_user_id = $2::uuid,
              void_reason = 'ROUND 190 self-correction: duplicate of FAC-2026-00091 (same real Faro invoice 46, load 13563). The wire_fee_cents/cash_rsv_cents/advance_amount_cents/factor_fee_cents/reserve_amount_cents this script had set are reverted to their pre-repost (zeroed/original) state since this row must never look like a live, independently-funded advance again.',
              wire_fee_cents = NULL, cash_rsv_cents = NULL, advance_amount_cents = 0,
              notes = notes || ' | ROUND-190 SELF-CORRECTION: reverted, duplicate of FAC-2026-00091, see reversal JE ' || $3
        WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
      [FAC_84_ID, SYSTEM_ACTOR_USER_ID, result.reversal_journal_entry_id, USMCA_ID]
    );

    await client.query("COMMIT");
    console.log("FAC-2026-00084 restored to voided state. Correction complete.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
