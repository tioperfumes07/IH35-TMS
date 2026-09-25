/**
 * R-159 item 1 (Lead, 2026-09-25 10:45 AM CT/15:45Z, deadline 20:00Z) — "Faro wire fees are in the
 * wrong account. 6300 Bank Service Charges & Wire Fees = 10.00, but the LAW wire total = 220.00.
 * 6400 Factoring Fees = 4,892.04 ... + 210.00 of wire fees. Fix the factoring-advance writer's
 * wire-fee account mapping to 6300. Re-post the affected advances through the factoring engine's
 * own void/re-post path."
 *
 * ROOT CAUSE, confirmed live before writing this (read-only, not guessed):
 * - The role mapping is ALREADY correct: accounting.chart_of_accounts_roles has factor_wire_fee ->
 *   6300 "Bank Service Charges & Wire Fees" and factor_fee_expense -> 6400 "Factoring Fees", both
 *   is_active=true. There is no mapping bug to fix in code.
 * - The real bug is HISTORICAL: commit 740b7be6fa (ROUND 86, PR #22329) fixed
 *   faro-csv-import.ts's postFactoringAdvanceEvent call to pass a real `ach_cents` (previously
 *   hardcoded 0, silently absorbing Faro's flat wire fee into the bundled 6400 fee). Advances
 *   funded/posted BEFORE that fix still carry the old, bundled posting.
 * - Cross-referenced against the owner's own canonical Faro purchases file
 *   (faro_canonical_purchases.json, 128 purchases): exactly 22 invoices carry a nonzero wire_fee,
 *   $10.00 each, summing to $220.00 -- exactly Lead's own cited target for 6300.
 * - Matched via each factoring_advances row's own `notes` field (a FARO_FEES={...} JSON blob
 *   written at import time, carrying the real per-advance fee breakdown -- NOT via
 *   faro_invoice_number, which stores a different, smaller sequence number in production, not the
 *   document invoice number the canonical file uses). Of the 22 live (non-voided) advances whose
 *   notes show `"fees":10` (or similar nonzero), exactly 1 (FAC-2026-00042) already has a live
 *   factor_wire_fee (6300) JE leg -- the rest, all 21, do not. 21 x $10.00 = $210.00, exactly
 *   Lead's own cited gap.
 *
 * FIX, per Lead's own instruction ("through the factoring engine's own void/re-post path"), no new
 * writer, no hand-written JE:
 *   1. reverseFactoringAdvanceEventInClientTx -- reverses the funding JE (and any linked
 *      factoring_default_interest JE that advance already had; 7 of the 21 do).
 *   2. postFactoringAdvanceEventInClientTx -- re-posts funding with the SAME liability/reserve as
 *      before, but fee_cents corrected to (original bundled factor_fee_cents - 1000) and
 *      ach_cents=1000 (the $10.00 wire fee), so postings/wire-fee split lands on 6300, not 6400.
 *   3. For the 7 advances whose reversal also removed a factoring_default_interest JE,
 *      postFactoringDefaultInterestAccrualEventInClientTx re-establishes it fresh (deterministic,
 *      day-count based off advance.advanced_at -- not a value this script invents or copies).
 *
 * ACCT-F2026092585 -- the standalone (connection-opening) postFactoringAdvanceEvent and
 * postFactoringDefaultInterestAccrualEvent both run SET ROLE ih35_app internally
 * (withLuciaBypass/withCurrentUser), which the ~/.ih35-gate.env credential cannot assume (confirmed
 * live). Added client-accepting InClientTx siblings to apps/backend/src/accounting/factoring-posting/
 * poster.service.ts (same precedent as the existing reverseFactoringAdvanceEventInClientTx) rather
 * than reimplementing the posting engine by hand here. Each advance's reverse+repost(+reaccrual) runs
 * as ONE transaction on this script's own bypassed client -- strictly MORE atomic than the standalone
 * functions' own behavior (whose phases are already separate, non-atomic connections). No
 * retryOnFactoringDeadlock wrapper here: this is a low-concurrency, single-operator one-shot script,
 * not a live multi-writer request path.
 *
 * Touches exactly these 21 named factoring_advances rows and their own linked JEs. No other
 * advance, no other account. Set ONLY_DISPLAY_ID=FAC-2026-NNNNN to run a single row (validate one
 * live write before trusting the batch).
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
const WIRE_FEE_CENTS = 1000; // $10.00, confirmed per-advance from the canonical Faro file + each row's own FARO_FEES notes.

const TARGET_DISPLAY_IDS = [
  "FAC-2026-00001", "FAC-2026-00003", "FAC-2026-00004", "FAC-2026-00006", "FAC-2026-00011",
  "FAC-2026-00014", "FAC-2026-00017", "FAC-2026-00019", "FAC-2026-00022", "FAC-2026-00023",
  "FAC-2026-00032", "FAC-2026-00035", "FAC-2026-00039", "FAC-2026-00043", "FAC-2026-00093",
  "FAC-2026-00101", "FAC-2026-00103", "FAC-2026-00117", "FAC-2026-00132", "FAC-2026-00133",
  "FAC-2026-00134",
];

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

const ONLY_DISPLAY_ID = process.env.ONLY_DISPLAY_ID?.trim() || null;

async function main() {
  const {
    reverseFactoringAdvanceEventInClientTx,
    postFactoringAdvanceEventInClientTx,
    postFactoringDefaultInterestAccrualEventInClientTx,
  } = await import("../../apps/backend/src/accounting/factoring-posting/poster.service.js");
  const { companyBusinessDate } = await import("../../apps/backend/src/lib/company-business-date.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";
  const results: Array<Record<string, unknown>> = [];

  try {
    const targets = ONLY_DISPLAY_ID ? [ONLY_DISPLAY_ID] : TARGET_DISPLAY_IDS;
    if (ONLY_DISPLAY_ID && !TARGET_DISPLAY_IDS.includes(ONLY_DISPLAY_ID)) {
      throw new Error(`ONLY_DISPLAY_ID=${ONLY_DISPLAY_ID} is not one of this script's 21 target rows -- STOP`);
    }

    // READ PHASE FIRST, entirely separate from the write phase -- this session's own Set B work
    // (docs/bus/OWNER-AUTHORIZATIONS.md AUTH-013) found live that reads interleaved with writes on
    // this Neon pooled endpoint can return false-empty results; resolving everything up front avoids
    // that class of bug entirely.
    const rowsRes = await queryWithBypass<{
      id: string; display_id: string; factor_fee_cents: string; invoice_total_cents: string; reserve_amount_cents: string;
      had_default_interest: boolean;
    }>(
      pool,
      `SELECT fa.id::text, fa.display_id, fa.factor_fee_cents::text, fa.invoice_total_cents::text, fa.reserve_amount_cents::text,
              EXISTS (
                SELECT 1 FROM accounting.journal_entry_postings jep
                  JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
                 WHERE jep.source_transaction_type = 'factoring_default_interest' AND jep.source_transaction_id = fa.id::text
                   AND je.status = 'posted' AND je.reversed_by_je_id IS NULL
              ) AS had_default_interest
         FROM accounting.factoring_advances fa
        WHERE fa.operating_company_id = $1::uuid AND fa.display_id = ANY($2::text[])
        ORDER BY fa.display_id`,
      [USMCA_ID, targets]
    );
    if (rowsRes.rows.length !== targets.length) {
      throw new Error(`Expected ${targets.length} advances, found ${rowsRes.rows.length} -- STOP`);
    }

    for (const row of rowsRes.rows) {
      const bundledFee = Number(row.factor_fee_cents);
      const correctedFee = bundledFee - WIRE_FEE_CENTS;
      if (correctedFee < 0) throw new Error(`${row.display_id}: factor_fee_cents=${bundledFee} < wire fee ${WIRE_FEE_CENTS} -- STOP, shape unexpected`);

      console.log(`${row.display_id}: bundled_fee=${bundledFee}c -> fee=${correctedFee}c + wire=${WIRE_FEE_CENTS}c, had_default_interest=${row.had_default_interest}`);
      if (dryRun) {
        results.push({ display_id: row.display_id, status: "dry_run_would_reverse_and_repost", bundled_fee_cents: bundledFee, corrected_fee_cents: correctedFee });
        continue;
      }

      // One transaction per advance, on this script's own bypassed client -- reverse, repost, and
      // (when applicable) reaccrue default interest all commit or roll back together.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        // reverseFactoringAdvanceEventInClientTx does NOT set this itself (per its own doc comment --
        // "does NOT set app.operating_company_id itself... the CALLER's responsibility"); the standalone
        // exported wrapper sets it before delegating, so this script must too.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

        const reversal = await reverseFactoringAdvanceEventInClientTx(client, {
          operating_company_id: USMCA_ID,
          factoring_advance_id: row.id,
          actor_user_id: SYSTEM_ACTOR_USER_ID,
          reason: "R-159 item 1 -- wire fee was bundled into 6400 Factoring Fees instead of split to 6300 Bank Service Charges & Wire Fees (pre-ROUND-86 posting); reversing to re-post with the correct split.",
        });
        if (!reversal.reversed) throw new Error(`${row.display_id}: reversal failed -- ${JSON.stringify(reversal)} -- STOP`);

        const repost = await postFactoringAdvanceEventInClientTx(client, {
          operating_company_id: USMCA_ID,
          factoring_advance_id: row.id,
          actor_user_id: SYSTEM_ACTOR_USER_ID,
          funding_figures: {
            invoice_total_cents: Number(row.invoice_total_cents),
            reserve_cents: Number(row.reserve_amount_cents),
            fee_cents: correctedFee,
            ach_cents: WIRE_FEE_CENTS,
          },
        });
        if (!repost.posted || !repost.journal_entry_id) {
          throw new Error(`${row.display_id}: re-post failed -- posted=${repost.posted} reason=${repost.reason} -- STOP`);
        }
        console.log(`  reversed_je=${reversal.reversal_journal_entry_id} new_je=${repost.journal_entry_id}`);

        let interestResult: unknown = null;
        if (row.had_default_interest) {
          const interest = await postFactoringDefaultInterestAccrualEventInClientTx(client, {
            operating_company_id: USMCA_ID,
            factoring_advance_id: row.id,
            actor_user_id: SYSTEM_ACTOR_USER_ID,
            accrual_date_iso: companyBusinessDate(),
          });
          interestResult = interest;
          console.log(`  default_interest_reaccrual: posted=${interest.posted} reason=${interest.reason ?? "n/a"} je=${interest.journal_entry_id ?? "n/a"}`);
        }

        await client.query("COMMIT");

        results.push({
          display_id: row.display_id,
          status: "reversed_and_reposted",
          bundled_fee_cents: bundledFee,
          corrected_fee_cents: correctedFee,
          wire_fee_cents: WIRE_FEE_CENTS,
          reversal_je: reversal.reversal_journal_entry_id,
          new_je: repost.journal_entry_id,
          default_interest_reaccrual: interestResult,
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(JSON.stringify(results, null, 2));
    if (dryRun) console.log("DRY_RUN=1 -- no writes were attempted.");
    else console.log("COMMITTED.");
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
