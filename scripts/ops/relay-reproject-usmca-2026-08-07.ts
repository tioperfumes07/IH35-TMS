#!/usr/bin/env tsx
// RELAY INTEGRATION -- ACTIVATE FOR USMCA, 2026-08-07 to today. Owner: "we are using the
// transportation relay account. so bring it in, only transactions from 08-07-2026 until today."
//
// ROOT CAUSE OF WHY "months=1 Import" FROM THE USMCA FUEL HOME PAGE PULLED 0 ROWS (verified live,
// audit.audit_events run_id d376688a): Relay is a payment NETWORK owned by TRANSP -- the Relay API
// account/entityCode belongs to TRANSP, not USMCA. Calling the live Relay API "as USMCA" returns
// nothing because Relay has no USMCA entity at all. The real data lives in TRANSP's own already-
// staged integrations.relay_fuel_transactions (pulled by TRANSP's daily cron / an earlier backfill),
// for trucks that happen to be currently_leased_to_company_id = USMCA.
//
// FIX: re-project TRANSP's already-staged rows into USMCA's own scope, reusing the REAL, already-
// shipped, already-guarded pipeline function verbatim -- NOT raw SQL, NOT new matching logic:
//   apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts -- upsertRelayFuelTransaction()
// which itself calls bridgeRelayFuelToCanonical() (fuel.fuel_transactions) and
// upsertRelayWalletBankFeedRow() (banking.bank_transactions), exactly mirroring what the daily
// "daily_pull" cron does per-company (relay-fuel-ingest.cron.ts:107-166, ingestForCompany). Per that
// file's own idempotency note: every conflict/idempotency key (staging upsert, GL posting-batch key)
// includes operating_company_id, so re-projecting to USMCA cannot touch or duplicate TRANSP's own
// 1,631 existing rows/postings -- they live under a different key entirely.
//
// raw_payload on each staged row is JSON.stringify(tx) of the ALREADY-PARSED RelayFuelTransaction
// (relay-fuel-ingest.service.ts:201) -- directly deserializable, no live Relay API call needed for
// this historical window.
//
// SCOPE: 76 TRANSP-staged rows dated 2026-08-07 through 2026-09-11 (TRANSP's own staging currently
// tops out at 09-11 -- see the "REMAINING" note in the OUTBOX report for the 09-12-today gap, which
// needs TRANSP's own daily cron/backfill refreshed, out of this USMCA-scoped task), unit resolved to
// a truck whose currently_leased_to_company_id = USMCA (verified live: ALL 76 in-window rows resolve
// this way -- zero belong to a TRANSP-leased truck).
//
// DEDUPE VERIFIED LIVE BEFORE THIS RUN (see OUTBOX report): zero of the 76 match an existing USMCA
// fuel.fuel_transactions row on same-day + exact total_cost + unit; a ±1-day/±$1 fuzzy pass found one
// coincidental near-miss (different load/settlement, $0.42 and 1 day apart) that is NOT the same
// purchase. All 76 are genuinely new.
//
// GL POSTING: EXPENSE_GL_POSTING_ENABLED is TRUE for USMCA (verified live) -- per company law
// ("POSTING FLAGS ARE ON... reuse existing posting path... no new GL math"), this script flushes GL
// exactly like the real cron does (flushFuelGlPostsAfterCommit, AFTER commit, idempotent by
// ih35:fuel-posting:v1:<company>:<fuel_event_id>:<path> key) -- same effect as if USMCA's own daily
// cron had picked these up on its normal schedule.
import pg from "pg";
import { upsertRelayFuelTransaction, type RelayIngestSource } from "../../apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.js";
import { flushFuelGlPostsAfterCommit } from "../../apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import type { RelayFuelTransaction } from "../../apps/backend/src/integrations/relay-payments/relay-client.js";
import type { FuelTxnGlPostCandidate } from "../../apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TRANSP_COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const WINDOW_START = "2026-08-07";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint -- session-scoped app.bypass_rls does not survive transaction pooling (see run-relay-wallet-bank-feed-backfill-once.mts precedent).");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const sourceRows = await client.query<{ raw_payload: unknown; transaction_id: string; relay_created_at: string }>(
    `SELECT raw_payload, transaction_id, relay_created_at::text
       FROM integrations.relay_fuel_transactions
      WHERE operating_company_id = $1::uuid
        AND is_active = true
        AND relay_created_at >= $2::date
      ORDER BY relay_created_at`,
    [TRANSP_COMPANY_ID, WINDOW_START]
  );
  console.log(`Found ${sourceRows.rowCount} TRANSP-staged rows >= ${WINDOW_START} to re-project to USMCA.`);

  let bridged = 0;
  let skippedNotUsmcaUnit = 0;
  const glCandidates: FuelTxnGlPostCandidate[] = [];

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

    for (const row of sourceRows.rows) {
      const tx = row.raw_payload as RelayFuelTransaction;
      console.log(`${executeFlag ? "BRIDGE" : "DRY-RUN"} ${tx.transaction_id} ${row.relay_created_at} $${tx.total_amount_paid} ${tx.merchant?.name ?? "?"}`);
      if (!executeFlag) continue;
      const result = await upsertRelayFuelTransaction(client as never, USMCA_COMPANY_ID, tx, "daily_pull" as RelayIngestSource);
      if (result.matched_unit_id) {
        bridged += 1;
      } else {
        skippedNotUsmcaUnit += 1;
      }
      if (result.gl_post_candidate) {
        // This env has no seeded SYSTEM_ACTOR_USER_ID row (unlike prod, where the daily cron's
        // fallback resolves) -- posting_batches.created_by_user_id is a real FK to identity.users,
        // verified live before this run. Use the same real Owner actor id every other real-route
        // write in this ROUND uses, never the unseeded system default.
        glCandidates.push({ ...result.gl_post_candidate, actor_user_id: OWNER_USER_ID });
      }
    }

    if (executeFlag) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log(`\n${executeFlag ? "EXECUTE" : "DRY RUN"} done: ${sourceRows.rowCount} rows -- unit-matched-and-bridged ${bridged}, unit-unmatched ${skippedNotUsmcaUnit}`);

  if (executeFlag && glCandidates.length > 0) {
    // AFTER COMMIT -- same rule the real cron follows (never post inside the ingest transaction).
    const flush = await flushFuelGlPostsAfterCommit(glCandidates, console as never);
    console.log(`GL flush: attempted=${flush.attempted} posted=${flush.posted} skipped_flag_off=${flush.skipped_flag_off} errors=${flush.errors}`);
  }

  await pool.end();
}

await main();
