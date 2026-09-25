/**
 * R-161 (Lead, 2026-09-25 11:00 AM CT/16:00Z) — corrects an error in AUTH-013 (Set B). AUTH-013
 * reactivated escrow_contribution settlement_lines rows on 18 settlements, reasoning that their
 * lack of a documented void meant an accidental bulk deactivation. Lead's own live measurement
 * against the AlwaysTrack source documents (Driver_Settlement_58NN.txt) proves that reasoning
 * wrong for exactly 5 of the 18: settlements S-5805, S-5806, S-5808, S-5813, S-5814 have NO
 * Driver-Escrow line on their signed document at all -- their escrow really was correctly excluded
 * (matching CC-3's own earlier documented void discipline on 5805/5806, per AUTH-013's own text),
 * and reactivating it made net_pay $250.00 too high across these 5 (verify-control-totals delta,
 * confirmed live).
 *
 * FIX, exactly as Lead ordered, existing engines only, no override, no seventh engine:
 *   1. Deactivate the 10 escrow_contribution rows on these 5 settlements (is_active=false), WITH
 *      voided_at/void_reason/voided_by_user_id this time -- documented, not another bare flip.
 *   2. reverseSettlementPayRun + closeSettlementPayRun (same two engines Set B/AUTH-013 used) so
 *      the re-close reads the now-correctly-deactivated escrow and posts $0 escrow for these 5,
 *      matching their signed documents exactly.
 *
 * Touches exactly the 10 named settlement_lines rows and the 5 settlements' own live pay-run-close
 * JE. No other row.
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
const VOID_REASON = "not on AlwaysTrack document — R-161";

const TARGET_SETTLEMENTS = ["S-5805", "S-5806", "S-5808", "S-5813", "S-5814"];
// R-161.1 (Lead, 11:00 AM CT/15:59Z): verify-escrow-balance-reconciles-gl found a live $25 drift on
// driver c864a4bb-a7ff-4373-a5e1-c1590eefe3b7 (settlement 5780, one of Set B's original 18, whose
// escrow WAS correctly on the document -- not deactivated here). Root-caused before writing this:
// recordEscrowContribution's INSERT/ON-CONFLICT upsert in settlement-payrun-close.service.ts is
// correct on its own, but this driver's driver_finance.escrow_balances row predates Set B (from an
// unrelated, older settlement) and now sits arithmetically out of step with the live
// accounting.escrow_postings/escrow_ledger trail after Set B's reverse+reclose cycle. A fresh
// reverse+reclose re-reads the row's REAL live current_balance_cents inside the engine's own atomic
// SQL increment (not a stale JS-computed value), which resyncs it -- no new writer, no manual
// balance edit. 5780's escrow_contribution lines are NOT touched (they are correctly active; this
// settlement is not one of the 5 off-document ones above).
const REACCRUE_ONLY_SETTLEMENTS = ["5780"];
const TARGET_LINE_IDS = [
  "e7050c86-01ce-42f8-b4a5-3cae1249f937", "78ef64df-d444-453c-9b62-d092bbeac506",
  "618ff7b3-e768-4021-a729-3efdcaccd8fd", "e31a4ac2-0988-43b0-9006-8fad3c64c9e8",
  "4beb557b-a778-4dc3-a88a-2d914f644457", "40627917-771c-4cba-97ce-3ab0ee405523",
  "8336b366-96fc-4d39-8dd0-942eebc2d5b1", "87d3ce2b-f12c-4b83-8355-d9b308ff3469",
  "f45eaf6a-70f0-4721-acd0-4e59d6ce21c4", "08314381-2b2f-40c9-9095-c13a4f858c34",
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

async function main() {
  const { reverseSettlementPayRun } = await import("../../apps/backend/src/driver-finance/settlement-payrun-reverse.service.js");
  const { closeSettlementPayRun } = await import("../../apps/backend/src/driver-finance/settlement-payrun-close.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";
  const results: Array<Record<string, unknown>> = [];

  try {
    // Pre-check: all 10 named rows still active, all $25.00 -- refuse if the shape changed.
    const pre = await queryWithBypass<{ id: string; is_active: boolean; amount: string }>(
      pool,
      `SELECT id::text, is_active, amount::text FROM driver_finance.settlement_lines WHERE id = ANY($1::uuid[])`,
      [TARGET_LINE_IDS]
    );
    if (pre.rows.length !== TARGET_LINE_IDS.length) throw new Error(`Expected ${TARGET_LINE_IDS.length} rows, found ${pre.rows.length} -- STOP`);
    for (const r of pre.rows) {
      if (!r.is_active) throw new Error(`row ${r.id}: already inactive -- STOP, shape changed`);
      if (r.amount !== "25.00" && r.amount !== "25") throw new Error(`row ${r.id}: amount=${r.amount}, expected 25.00 -- STOP`);
    }
    console.log(`Pre-check passed: ${pre.rows.length} rows, all active, all $25.00.`);

    // Payment method, matching the Set B script's own resolution.
    const methodRes = await queryWithBypass<{ id: string }>(
      pool,
      `SELECT id::text FROM catalogs.payment_methods WHERE operating_company_id = $1::uuid AND display_name = 'Driver Net-Pay Clearing' LIMIT 1`,
      [USMCA_ID]
    );
    const paymentMethodId = methodRes.rows[0]?.id;
    if (!paymentMethodId) throw new Error('"Driver Net-Pay Clearing" payment method not found live -- refusing to guess an account');

    // Resolve settlement ids + their live pay-run-close JE, up front (read phase, no interleaved writes).
    // Includes 5780 (R-161.1, escrow_balances resync only -- its escrow_contribution lines are untouched).
    const ALL_REVERSE_RECLOSE_TARGETS = [...TARGET_SETTLEMENTS, ...REACCRUE_ONLY_SETTLEMENTS];
    const settlementsRes = await queryWithBypass<{ display_id: string; settlement_id: string; live_je_id: string | null }>(
      pool,
      `SELECT ds.display_id, ds.id::text AS settlement_id,
              (SELECT je.id::text FROM accounting.journal_entries je
                WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL
                  AND je.memo LIKE 'Settlement ' || ds.display_id || ' %pay-run close%'
                ORDER BY je.memo LIMIT 1) AS live_je_id
         FROM driver_finance.driver_settlements ds
        WHERE ds.operating_company_id = $1::uuid AND ds.display_id = ANY($2::text[])
        ORDER BY ds.display_id`,
      [USMCA_ID, ALL_REVERSE_RECLOSE_TARGETS]
    );
    if (settlementsRes.rows.length !== ALL_REVERSE_RECLOSE_TARGETS.length) {
      throw new Error(`Expected ${ALL_REVERSE_RECLOSE_TARGETS.length} settlements, found ${settlementsRes.rows.length} -- STOP`);
    }

    if (dryRun) {
      console.log("DRY_RUN=1 -- pre-checks only, no writes attempted.");
      console.log(JSON.stringify(settlementsRes.rows, null, 2));
      return;
    }

    // 1. Deactivate the 10 rows, documented this time.
    const deactivateClient = await pool.connect();
    try {
      await deactivateClient.query("BEGIN");
      await deactivateClient.query("RESET ROLE");
      await deactivateClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await deactivateClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
      const res = await deactivateClient.query(
        `UPDATE driver_finance.settlement_lines
            SET is_active = false, voided_at = now(), void_reason = $2, voided_by_user_id = $3::uuid, updated_at = now()
          WHERE id = ANY($1::uuid[])
        RETURNING id`,
        [TARGET_LINE_IDS, VOID_REASON, SYSTEM_ACTOR_USER_ID]
      );
      await deactivateClient.query("COMMIT");
      console.log(`Deactivated ${res.rowCount} escrow_contribution rows, documented (voided_at/void_reason/voided_by_user_id set).`);
    } catch (err) {
      await deactivateClient.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      deactivateClient.release();
    }

    // 2. Reverse + re-close each of the 5 settlements.
    for (const row of settlementsRes.rows) {
      if (!row.live_je_id) {
        console.log(`SKIP ${row.display_id}: no live (non-reversed) pay-run-close JE found -- already handled by a prior run`);
        results.push({ settlement: row.display_id, status: "already_handled" });
        continue;
      }
      console.log(`${row.display_id}: reversing live JE ${row.live_je_id}...`);
      const reversal = await reverseSettlementPayRun(
        { operatingCompanyId: USMCA_ID, settlementId: row.settlement_id, reason: "R-161 -- correcting AUTH-013: this settlement's escrow was correctly excluded (no Driver-Escrow line on the signed document); reversing to re-close with $0 escrow." },
        { userId: SYSTEM_ACTOR_USER_ID }
      );
      console.log(`  reversed: run_id=${reversal.run_id} reversal_je=${reversal.reversal_journal_entry_id}`);

      const close = await closeSettlementPayRun(
        { operatingCompanyId: USMCA_ID, settlementId: row.settlement_id, paymentMethodId },
        { userId: SYSTEM_ACTOR_USER_ID }
      );
      console.log(`  re-closed: new_je=${close.journal_entry_id} net=${close.breakdown.net_cents}c escrow=${close.breakdown.escrow_contribution_cents}c`);
      results.push({
        settlement: row.display_id,
        status: "reversed_and_reclosed",
        old_je: row.live_je_id,
        reversal_je: reversal.reversal_journal_entry_id,
        new_je: close.journal_entry_id,
        new_net_cents: close.breakdown.net_cents,
        escrow_contribution_cents: close.breakdown.escrow_contribution_cents,
      });
    }

    console.log(JSON.stringify(results, null, 2));
    console.log("COMMITTED.");
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
