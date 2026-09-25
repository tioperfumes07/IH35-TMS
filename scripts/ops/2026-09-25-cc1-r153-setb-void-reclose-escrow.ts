/**
 * R-153.9 Set B (Lead, 2026-09-25 7:27 AM CT/12:27Z) — the 18 settlements whose live pay-run-close
 * JE (this session's own earlier "ACCT-F20260924/25 tie ... to AlwaysTrack total_due" reversal-and-
 * repost work) dropped the 2100-00-0NN escrow line entirely (PR #22594's own finding, $2,650.00
 * gross). For each: void the one currently-live JE, then re-close ONCE through the real settlement
 * engine (closeSettlementPayRun) so escrow posts correctly this time.
 *
 * TARGET SETTLEMENTS (Lead's own list, live-confirmed exactly one non-reversed
 * "Settlement N — pay-run close" JE per settlement before writing this):
 *   5770, 5771, 5777, 5780, 5783, 5786, 5789, 5793, 5796,
 *   S-5797, S-5799, S-5800, S-5802, S-5805, S-5806, S-5808, S-5813, S-5814
 *
 * WHY reverseSettlementPayRun, NOT the generic voidJournalEntry: closeSettlementPayRun's own
 * idempotency guard (settlement-payrun-claim.service.ts's claimSettlementPayRunInClientTx) is keyed
 * on a UNIQUE (operating_company_id, settlement_id) row in driver_finance.payrun_gl_runs. Voiding
 * the JE alone would leave that claim row status='posted', so a fresh closeSettlementPayRun call
 * would find `claimed: false` and silently return the OLD (now-voided) JE id -- no new JE would
 * ever post. reverseSettlementPayRun (settlement-payrun-reverse.service.ts) is the purpose-built,
 * already-reviewed reverse counterpart: it reverses the JE via reverseJournalEntryNoFlip, undoes
 * the advance-recovery and escrow-contribution sub-ledger state the close mutated, and marks the
 * payrun_gl_runs run status='void' -- which claimSettlementPayRunInClientTx explicitly knows how to
 * re-claim (verifies a unique posted reversal exists, then resets status='posted',
 * journal_entry_id=NULL) so the very next closeSettlementPayRun call posts a genuinely fresh JE.
 * This is "void, then re-close once through the settlement engine" using the SAME two engines that
 * posted and would normally reverse a real settlement -- no new GL math, no hand-written JE.
 *
 * ESCROW: closeSettlementPayRun computes the escrow contribution itself (either the per-load
 * accrued sum for load_bookended settlements, or the capped standard contribution) -- this script
 * never passes standardEscrowContributionCents, so the engine's own default (the correct,
 * document-derived figure Lead's order describes: "the escrow line from the driver settlement PDF,
 * cap 2,500") is what posts, not a value this script chooses.
 *
 * NET-PAY FLOOR (SET-05): if a re-close would breach the resolved floor, closeSettlementPayRun
 * throws NET_PAY_NEGATIVE or the floor error rather than silently capping -- this script does NOT
 * pass overrideFloor, so any such settlement fails loud and is reported, never forced through.
 *
 * Idempotent per settlement: if the live JE for a settlement no longer matches "posted,
 * reversed_by_je_id IS NULL", it is skipped as already-handled by a prior run.
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

const TARGET_SETTLEMENTS = [
  "5770", "5771", "5777", "5780", "5783", "5786", "5789", "5793", "5796",
  "S-5797", "S-5799", "S-5800", "S-5802", "S-5805", "S-5806", "S-5808", "S-5813", "S-5814",
];

async function main() {
  const { reverseSettlementPayRun } = await import("../../apps/backend/src/driver-finance/settlement-payrun-reverse.service.js");
  const { closeSettlementPayRun } = await import("../../apps/backend/src/driver-finance/settlement-payrun-close.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  // ROOT CAUSE, found after 5 live failed attempts (every mitigation short of this one -- session-
  // scope config, per-read retry, a brand-new connection per read, a 5s pacing delay -- still failed
  // deterministically on the settlement immediately after any reverseSettlementPayRun/
  // closeSettlementPayRun call): those two engine functions run inside withCurrentUser
  // (apps/backend/src/auth/db.ts), which does `SET LOCAL ROLE ih35_app` on its pooled connection
  // before running -- LOCAL/transaction-scoped, so it SHOULD auto-revert on COMMIT. But this
  // session's own already-documented landmine ("Neon pooled connection downgrades to ih35_app --
  // RESET ROLE before DDL") is exactly PgBouncer transaction-pooling handing that SAME underlying
  // Postgres BACKEND PROCESS to the NEXT unrelated frontend connection (mine) without a clean
  // RESET ROLE in between -- so my very next query, even on a brand-new pg.Pool().connect() client
  // pointed at the SAME db, can silently run AS ih35_app (a restricted, RLS-enforced role) instead
  // of the DATABASE_URL login. `app.bypass_rls` alone doesn't help if ih35_app's own grants (not
  // just its RLS policies) don't cover the read. Fix: RESET ROLE first, on every fresh connection,
  // before trusting anything about its role.
  async function queryWithBypass<T extends pg.QueryResultRow = { id: string }>(sql: string, params: unknown[]): Promise<pg.QueryResult<T>> {
    const client = await pool.connect();
    try {
      await client.query(`RESET ROLE`);
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
      return await client.query<T>(sql, params);
    } finally {
      client.release();
    }
  }
  const results: Array<Record<string, unknown>> = [];
  const dryRun = process.env.DRY_RUN === "1";

  // Same resolution driver-finance's own postLoadBookendedSettlementGlAfterClose uses: the
  // records-only "Driver Net-Pay Clearing" catalog payment method (matches every one of these 18
  // settlements' own driver_finance.driver_settlements.payment_method text field, confirmed live).
  const methodRes = await queryWithBypass<{ id: string }>(
    `SELECT id::text FROM catalogs.payment_methods
      WHERE operating_company_id = $1::uuid AND display_name = 'Driver Net-Pay Clearing' LIMIT 1`,
    [USMCA_ID]
  );
  const paymentMethodId = methodRes.rows[0]?.id;
  if (!paymentMethodId) throw new Error('"Driver Net-Pay Clearing" payment method not found live -- refusing to guess an account');

  // READ PHASE, entirely separate from the WRITE phase below -- six straight live failures (one
  // production, five rehearsal) all showed the exact same shape: the settlement lookup immediately
  // AFTER a reverseSettlementPayRun+closeSettlementPayRun pair returns 0 rows for a row independently
  // confirmed to exist at that exact moment via a totally separate connection, and neither a fresh
  // connection per read, a retry loop, a 5s pacing delay, nor RESET ROLE fixed it. Rather than keep
  // guessing at a root cause for reads interleaved with writes, this resolves EVERY settlement id and
  // its live JE id UP FRONT, before any write happens at all -- so no read in this script ever
  // executes after a write it could be affected by.
  type Resolved = { displayId: string; settlementId: string; liveJeId: string | null };
  const resolved: Resolved[] = [];
  for (const displayId of TARGET_SETTLEMENTS) {
    const settlementRes = await queryWithBypass<{ id: string }>(
      `SELECT id::text FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid AND display_id = $2 LIMIT 1`,
      [USMCA_ID, displayId]
    );
    const settlementId = settlementRes.rows[0]?.id;
    if (!settlementId) throw new Error(`settlement ${displayId}: not found -- STOP`);

    const liveJeRes = await queryWithBypass<{ id: string }>(
      `SELECT id::text FROM accounting.journal_entries
        WHERE operating_company_id = $1::uuid AND status = 'posted' AND reversed_by_je_id IS NULL
          AND memo LIKE $2
        ORDER BY memo LIMIT 1`,
      [USMCA_ID, `Settlement ${displayId} %pay-run close%`]
    );
    resolved.push({ displayId, settlementId, liveJeId: liveJeRes.rows[0]?.id ?? null });
  }
  console.log(`Resolved all ${resolved.length} settlements up front (read phase complete, no writes yet).`);

  try {
    for (const { displayId, settlementId, liveJeId } of resolved) {
      if (!liveJeId) {
        console.log(`SKIP ${displayId}: no live (non-reversed) pay-run-close JE found -- already handled by a prior run`);
        results.push({ settlement: displayId, status: "already_handled" });
        continue;
      }

      console.log(`${displayId}: reversing live JE ${liveJeId}...`);
      if (dryRun) {
        results.push({ settlement: displayId, status: "dry_run_would_reverse", old_je: liveJeId });
        continue;
      }

      const reversal = await reverseSettlementPayRun(
        { operatingCompanyId: USMCA_ID, settlementId, reason: "R-153.9 Set B: this JE dropped the 2100-00-0NN escrow line entirely on repost (PR #22594) -- reversing to re-close correctly with escrow." },
        { userId: SYSTEM_ACTOR_USER_ID }
      );
      console.log(`  reversed: run_id=${reversal.run_id} reversal_je=${reversal.reversal_journal_entry_id}`);

      const close = await closeSettlementPayRun(
        { operatingCompanyId: USMCA_ID, settlementId, paymentMethodId },
        { userId: SYSTEM_ACTOR_USER_ID }
      );
      console.log(`  re-closed: new_je=${close.journal_entry_id} net=${close.breakdown.net_cents}c escrow=${close.breakdown.escrow_contribution_cents}c`);
      results.push({
        settlement: displayId,
        status: "reversed_and_reclosed",
        old_je: liveJeId,
        reversal_je: reversal.reversal_journal_entry_id,
        new_je: close.journal_entry_id,
        new_net_cents: close.breakdown.net_cents,
        escrow_contribution_cents: close.breakdown.escrow_contribution_cents,
      });
    }

    console.log(JSON.stringify(results, null, 2));
    if (dryRun) console.log("DRY_RUN=1 -- no writes were attempted (read-only preview above).");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FAILED:", (err as Error).message);
  process.exitCode = 1;
});
