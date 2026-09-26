/**
 * R-187 G4 (step 2 of 3, the cash_rsv piece): Faro's "Cash Rsv" export column was silently posted
 * into 1230 Factoring Reserves (factor_reserve_held) at funding time, alongside the driver's actual
 * Escrow Rsv, instead of its own reserve pool (owner ruling: GL 1235 / factor_cash_reserve_held,
 * added this round). Confirmed live per-invoice against the PURCHASE REPORT (Escrow Rsv column vs
 * what factoring_advances.reserve_amount_cents actually holds):
 *
 *   FAC-2026-00001 (Faro inv 3, NCC): live reserve=3090c, Escrow Rsv=0, Cash Rsv=3090c -- ALL of it
 *     is Cash Rsv contamination.
 *   FAC-2026-00004 (Faro inv 4, Watco): live reserve=2550c, Escrow Rsv=0, Cash Rsv=2550c.
 *   FAC-2026-00007 (Faro inv 7, ITS Logistics): live reserve=502c, Escrow Rsv=0, Cash Rsv=502c.
 *   FAC-2026-00008 (Faro inv 11, Sethmar): live reserve=911c, Escrow Rsv=0, Cash Rsv=911c.
 *   FAC-2026-00009 (Faro inv 8, FLS Transport -- also flagged separately in G3a for a WRONG-invoice
 *     linkage; this script only corrects ITS OWN dollar amounts, orthogonal to that linkage question):
 *     live reserve=788c, Escrow Rsv=0, Cash Rsv=788c.
 *
 * factor_fee_cents is DELIBERATELY left untouched here: 3 of these 5 rows (00001, 00007, 00008) also
 * carry a Sch Fee contamination in their fee, but Sch Fee's GL destination has no owner ruling yet
 * (unlike Cash Rsv's explicit "GL 1235" ruling already in the code) -- flagged separately, not
 * guessed at here.
 *
 * Same reverse+repost mechanism as R-159's wire-fee-split (reverseJournalEntryNoFlip on the funding
 * JE only + postFactoringAdvanceEventInClientTx with corrected funding_figures, claiming the next
 * funding#revN via R-159.2's revision mechanism). Reserve is reduced by exactly the Cash Rsv amount;
 * fee, wire (ach), and invoice_total are passed through UNCHANGED from their current live values.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

// display_id -> the exact Cash Rsv amount (cents) to extract from reserve_amount_cents, per the
// PURCHASE REPORT's own "Cash Rsv" column for that invoice.
const TARGETS: Record<string, number> = {
  "FAC-2026-00001": 3090,
  "FAC-2026-00004": 2550,
  "FAC-2026-00007": 502,
  "FAC-2026-00008": 911,
  "FAC-2026-00009": 788,
  // AUTH-058 addendum: 8/18/26 (Faro inv 16, MPH CARRIER SERVICES) was missed from the original
  // 5-day sweep -- found running verify-feed-day.mjs --all AFTER the first 5 were fixed. Same
  // Escrow Rsv=0/Cash Rsv=57.00 contamination shape; fee already correct (Discount=Fee, no Sch Fee).
  "FAC-2026-00043": 5700,
};

async function queryWithBypass<T extends pg.QueryResultRow>(pool: pg.Pool, sql: string, params: unknown[]): Promise<pg.QueryResult<T>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
    const result = await client.query<T>(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const { postFactoringAdvanceEventInClientTx } = await import(
    "../../apps/backend/src/accounting/factoring-posting/poster.service.js"
  );
  const { reverseJournalEntryNoFlip } = await import("../../apps/backend/src/accounting/journal-entries.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  try {
    const targets = Object.keys(TARGETS);
    const rowsRes = await queryWithBypass<{
      id: string; display_id: string; invoice_total_cents: string; reserve_amount_cents: string;
      factor_fee_cents: string; wire_fee_cents: string | null; cash_rsv_cents: string | null;
      funding_je_id: string;
    }>(
      pool,
      // BUG FIX: 2 of these 5 rows (FAC-2026-00001/00004) already went through R-159's wire-fee-split
      // revision claim -- their LIVE funding JE is keyed under 'funding#rev1', not the base 'funding'
      // event_key. Joining on event_key='funding' literally would fetch the ORIGINAL, already-reversed
      // JE id instead (confirmed live: first attempt at this script hit repair_candidate_invalid
      // because it tried to reverse an already-reversed JE's now-stale id). Match either the base key
      // or any revision, then keep only the one whose JE is still live (not reversed).
      `SELECT fa.id::text, fa.display_id, fa.invoice_total_cents::text, fa.reserve_amount_cents::text,
              fa.factor_fee_cents::text, fa.wire_fee_cents::text, fa.cash_rsv_cents::text,
              k.journal_entry_id::text AS funding_je_id
         FROM accounting.factoring_advances fa
         JOIN accounting.factoring_lifecycle_posting_keys k
           ON k.operating_company_id = fa.operating_company_id
          AND k.factoring_advance_id = fa.id
          AND k.source_transaction_type = 'factoring_advance'
          AND k.event_key ~ '^funding(#rev[0-9]+)?$'
         JOIN accounting.journal_entries je
           ON je.id = k.journal_entry_id AND je.reversed_by_je_id IS NULL
        WHERE fa.operating_company_id = $1::uuid AND fa.display_id = ANY($2::text[])
        ORDER BY fa.display_id`,
      [USMCA_ID, targets]
    );
    if (rowsRes.rows.length !== targets.length) {
      throw new Error(`Expected ${targets.length} advances, found ${rowsRes.rows.length} -- STOP`);
    }

    for (const row of rowsRes.rows) {
      const cashRsv = TARGETS[row.display_id]!;
      if (row.cash_rsv_cents != null) {
        console.log(`${row.display_id}: SKIP -- cash_rsv_cents already set (${row.cash_rsv_cents}c), assumed already fixed.`);
        results.push({ display_id: row.display_id, status: "skip_already_fixed" });
        continue;
      }
      const currentReserve = Number(row.reserve_amount_cents);
      const correctedReserve = currentReserve - cashRsv;
      if (correctedReserve < 0) throw new Error(`${row.display_id}: reserve_amount_cents=${currentReserve} < cash_rsv ${cashRsv} -- STOP, shape unexpected`);

      console.log(`${row.display_id}: reserve ${currentReserve}c -> ${correctedReserve}c, cash_rsv_cents -> ${cashRsv}c (fee ${row.factor_fee_cents}c, wire ${row.wire_fee_cents ?? 0}c unchanged)`);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

        const reversal = await reverseJournalEntryNoFlip(client, {
          operatingCompanyId: USMCA_ID,
          journalEntryId: row.funding_je_id,
          reason: "R-187 G4 -- Faro's Cash Rsv was posted into 1230 Factoring Reserves (factor_reserve_held) instead of its own reserve pool (owner ruling: GL 1235 / factor_cash_reserve_held); reversing ONLY the funding leg to re-post with the correct split. Fee and wire legs are unchanged.",
          actorUserId: SYSTEM_ACTOR_USER_ID,
        });
        if (!reversal.reversal.reversal_journal_entry_id) {
          throw new Error(`${row.display_id}: reversal failed -- ${JSON.stringify(reversal)} -- STOP`);
        }

        const repost = await postFactoringAdvanceEventInClientTx(client, {
          operating_company_id: USMCA_ID,
          factoring_advance_id: row.id,
          actor_user_id: SYSTEM_ACTOR_USER_ID,
          funding_figures: {
            invoice_total_cents: Number(row.invoice_total_cents),
            reserve_cents: correctedReserve,
            fee_cents: Number(row.factor_fee_cents),
            ach_cents: row.wire_fee_cents != null ? Number(row.wire_fee_cents) : 0,
            cash_rsv_cents: cashRsv,
          },
        });
        if (!repost.posted || !repost.journal_entry_id) {
          throw new Error(`${row.display_id}: re-post failed -- posted=${repost.posted} reason=${repost.reason} -- STOP`);
        }
        console.log(`  reversed_je=${reversal.reversal.reversal_journal_entry_id} new_je=${repost.journal_entry_id}`);

        await client.query("COMMIT");
        results.push({
          display_id: row.display_id,
          status: "reversed_and_reposted",
          reserve_before: currentReserve,
          reserve_after: correctedReserve,
          cash_rsv_cents: cashRsv,
          reversal_je: reversal.reversal.reversal_journal_entry_id,
          new_je: repost.journal_entry_id,
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(JSON.stringify(results, null, 2));
    console.log("DONE.");
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
