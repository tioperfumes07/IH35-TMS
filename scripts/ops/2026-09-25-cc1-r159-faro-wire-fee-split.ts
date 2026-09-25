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
 *   1. Reverse ONLY the funding JE (reverseJournalEntryNoFlip on that one JE id, resolved live from
 *      factoring_lifecycle_posting_keys event_key='funding') -- NOT the whole-lifecycle
 *      reverseFactoringAdvanceEventInClientTx, which reverses EVERY live linked leg on the advance,
 *      including any daily factoring_default_interest accruals. Live-discovered running this exact
 *      script on FAC-2026-00001 (AUTH-040, first attempt): that advance alone carries ELEVEN daily
 *      default-interest accruals (2026-09-15 through 2026-09-25), not one -- an earlier draft's
 *      "had_default_interest" check meant "at least one", never "exactly one". Reversing all of them
 *      just to correct one unrelated $10 wire-fee split on the funding leg would require re-deriving
 *      11 days of independent, balance-dependent interest math per advance across up to 7 of the 21
 *      rows -- unnecessary risk for a leg this fix never needed to touch. Whole-transaction rollback
 *      confirmed live on that first attempt: FAC-2026-00001's funding claim still pointed at its
 *      original, unreversed JE afterward -- nothing was left half-done.
 *   2. postFactoringAdvanceEventInClientTx -- re-posts funding with the SAME liability/reserve as
 *      before, but fee_cents corrected to (original bundled factor_fee_cents - 1000) and
 *      ach_cents=1000 (the $10.00 wire fee), so postings/wire-fee split lands on 6300, not 6400. The
 *      R-159.2 revision-claim mechanism (ACCT-F2026092589) lets this re-post succeed under
 *      "funding#rev1" even though "funding" is still permanently claimed by the now-reversed original.
 *   No default-interest re-accrual step: those legs are never reversed, so there is nothing to
 *   re-establish.
 *
 * IDEMPOTENCY GUARD: a prior run may have already fixed some of these 21 rows (e.g. a single-row
 * ONLY_DISPLAY_ID validation run before the full batch). The read phase checks for an existing
 * "funding#revN" claim per advance and SKIPS it -- re-deriving corrected_fee from an
 * ALREADY-corrected factor_fee_cents would double-subtract the wire fee. Confirmed live: running the
 * full batch right after a successful ONLY_DISPLAY_ID=FAC-2026-00001 run correctly printed
 * "SKIP -- already has a funding#revN claim" for that row and processed the other 20 normally.
 *
 * ACCT-F2026092585 -- the standalone (connection-opening) postFactoringAdvanceEvent runs SET ROLE
 * ih35_app internally (withLuciaBypass/withCurrentUser), which the ~/.ih35-gate.env credential
 * cannot assume (confirmed live). Added a client-accepting postFactoringAdvanceEventInClientTx to
 * apps/backend/src/accounting/factoring-posting/poster.service.ts (same precedent as the existing
 * reverseFactoringAdvanceEventInClientTx) rather than reimplementing the posting engine by hand
 * here. reverseJournalEntryNoFlip already accepts a plain client (no SET ROLE issue). Each advance's
 * reverse+repost runs as ONE transaction on this script's own bypassed client. No
 * retryOnFactoringDeadlock wrapper here: this is a low-concurrency, single-operator one-shot script,
 * not a live multi-writer request path.
 *
 * Touches exactly these 21 named factoring_advances rows and ONLY their funding JE. No other
 * advance, no other leg, no other account. Set ONLY_DISPLAY_ID=FAC-2026-NNNNN to run a single row
 * (validate one live write before trusting the batch).
 *
 * RESULT (AUTH-040, production, 2026-09-25): 1 skipped (already fixed by the earlier validation
 * run), 20 reversed_and_reposted. Live proof: node scripts/verify-feed-day.mjs --all -- 18 of 22
 * days now PASS purely from this fix (was 1 of 22 before); the 4 remaining FAIL days (8/10, 8/12,
 * 8/13, 8/14) carry a SEPARATE, unrelated escrow discrepancy (ROUND 187 G4's own second half, not
 * yet fixed). GL 6300 (factoring_advance source only) = $220.00 exactly; 6400 (same scope) =
 * $4,682.04 -- both match Lead's own cited targets exactly. Trial balance nets 0.
 * verify-factoring-event-one-live-claim.mjs LIVE PASS (263 claims, 0 violations) after the run.
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
  const { postFactoringAdvanceEventInClientTx } = await import(
    "../../apps/backend/src/accounting/factoring-posting/poster.service.js"
  );
  const { reverseJournalEntryNoFlip } = await import("../../apps/backend/src/accounting/journal-entries.service.js");

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
      funding_je_id: string; other_live_legs: string; already_fixed: boolean;
    }>(
      pool,
      `SELECT fa.id::text, fa.display_id, fa.factor_fee_cents::text, fa.invoice_total_cents::text, fa.reserve_amount_cents::text,
              k.journal_entry_id::text AS funding_je_id,
              (
                SELECT count(*)::text FROM accounting.factoring_lifecycle_posting_keys k2
                 WHERE k2.operating_company_id = fa.operating_company_id
                   AND k2.factoring_advance_id = fa.id
                   AND NOT (k2.source_transaction_type = 'factoring_advance' AND k2.event_key LIKE 'funding%')
              ) AS other_live_legs,
              -- IDEMPOTENCY GUARD: a prior run of this exact script already claimed a funding
              -- revision key for this advance. Re-running the batch (e.g. because ONLY_DISPLAY_ID
              -- validated one row and the full batch is now run without excluding it) must SKIP an
              -- already-fixed row, never re-derive corrected_fee from the ALREADY-corrected
              -- factor_fee_cents (which would double-subtract the wire fee).
              EXISTS (
                SELECT 1 FROM accounting.factoring_lifecycle_posting_keys k3
                 WHERE k3.operating_company_id = fa.operating_company_id
                   AND k3.factoring_advance_id = fa.id
                   AND k3.source_transaction_type = 'factoring_advance'
                   AND k3.event_key ~ '^funding#rev[0-9]+$'
              ) AS already_fixed
         FROM accounting.factoring_advances fa
         JOIN accounting.factoring_lifecycle_posting_keys k
           ON k.operating_company_id = fa.operating_company_id
          AND k.factoring_advance_id = fa.id
          AND k.source_transaction_type = 'factoring_advance'
          AND k.event_key = 'funding'
        WHERE fa.operating_company_id = $1::uuid AND fa.display_id = ANY($2::text[])
        ORDER BY fa.display_id`,
      [USMCA_ID, targets]
    );
    if (rowsRes.rows.length !== targets.length) {
      throw new Error(`Expected ${targets.length} advances, found ${rowsRes.rows.length} -- STOP`);
    }

    for (const row of rowsRes.rows) {
      if (row.already_fixed) {
        console.log(`${row.display_id}: SKIP -- already has a funding#revN claim (fixed by an earlier run of this script).`);
        results.push({ display_id: row.display_id, status: "skip_already_fixed" });
        continue;
      }

      const bundledFee = Number(row.factor_fee_cents);
      const correctedFee = bundledFee - WIRE_FEE_CENTS;
      if (correctedFee < 0) throw new Error(`${row.display_id}: factor_fee_cents=${bundledFee} < wire fee ${WIRE_FEE_CENTS} -- STOP, shape unexpected`);

      console.log(`${row.display_id}: bundled_fee=${bundledFee}c -> fee=${correctedFee}c + wire=${WIRE_FEE_CENTS}c, other_live_legs=${row.other_live_legs} (untouched)`);
      if (dryRun) {
        results.push({ display_id: row.display_id, status: "dry_run_would_reverse_and_repost", bundled_fee_cents: bundledFee, corrected_fee_cents: correctedFee });
        continue;
      }

      // One transaction per advance, on this script's own bypassed client -- reverse the funding
      // leg only and repost it, commit or roll back together.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

        // Reverse ONLY the funding JE -- never the whole lifecycle. See the header comment: this
        // advance may carry unrelated, already-correct legs (daily default-interest accruals,
        // customer payments) that must not be touched by a wire-fee-split correction.
        const reversal = await reverseJournalEntryNoFlip(client, {
          operatingCompanyId: USMCA_ID,
          journalEntryId: row.funding_je_id,
          reason: "R-159 item 1 -- wire fee was bundled into 6400 Factoring Fees instead of split to 6300 Bank Service Charges & Wire Fees (pre-ROUND-86 posting); reversing ONLY the funding leg to re-post with the correct split. Other lifecycle legs (default interest, customer payments) on this advance are untouched.",
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
            reserve_cents: Number(row.reserve_amount_cents),
            fee_cents: correctedFee,
            ach_cents: WIRE_FEE_CENTS,
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
          bundled_fee_cents: bundledFee,
          corrected_fee_cents: correctedFee,
          wire_fee_cents: WIRE_FEE_CENTS,
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
