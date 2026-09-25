/**
 * R-161 part 2 — R-161's own required proof (verify-alwaystrack-parity 34/34) surfaced that the
 * SAME root cause Lead identified for 5 settlements (AUTH-013 wrongly reactivated escrow_contribution
 * lines with no Driver-Escrow line on the signed AlwaysTrack document) applies to the REMAINING 13 of
 * Set B's original 18, not just those 5 -- Lead's own control-totals check was scoped to 5804-5815
 * (12 settlements) and caught 5 of them there; these 13 sit outside that range and were only
 * surfaced once the broader alwaystrack-parity guard ran post-AUTH-015/016.
 *
 * Confirmed live, not guessed, before writing this: grepped "escrow" (case-insensitive) against
 * every one of these 13 settlements' own signed Driver_Settlement_NNNN.txt
 * (~/Downloads/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/settlement-text/) -- zero mentions
 * on every single one, exactly the same shape as the 5 already fixed.
 *
 * Same fix, same two engines, no override, no seventh engine:
 *   1. Deactivate the 25 escrow_contribution rows on these 13 settlements (is_active=false), WITH
 *      voided_at/void_reason/voided_by_user_id documented.
 *   2. reverseSettlementPayRun + closeSettlementPayRun so the re-close reads $0 escrow, matching the
 *      signed documents exactly.
 *
 * Touches exactly the 25 named settlement_lines rows and these 13 settlements' own live pay-run-close
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
const VOID_REASON = "not on AlwaysTrack document — R-161 part 2";

const TARGET_SETTLEMENTS = [
  "5770", "5771", "5777", "5780", "5783", "5786", "5789", "5793", "5796",
  "S-5797", "S-5799", "S-5800", "S-5802",
];
const TARGET_LINE_IDS = [
  "51541995-3c55-4ff7-b24f-d17e19dd1431", "65ea5357-f2b8-42e8-91b1-39ecb5aab338",
  "45c963e2-ab4c-41b1-86b9-b3d25e702b61", "2a0d7359-718d-47d8-b6cd-99c7e97d8aa3",
  "28df60f5-61fa-4906-acf4-63988e060cf1", "4f8d1f69-a1d1-47a9-9661-2d0c2e328009",
  "7b506537-467f-4de8-8505-613c9fc04ef2",
  "9ad5dbc8-b2fa-4094-b4ad-27f332ed95b8", "c9ed99a4-e1b6-4b8f-9c70-799ce7325ad8",
  "3fa1a378-12fa-46aa-a11a-1c1a09d58c63", "af3d3770-09b0-4d07-9c7d-5a50d0dd4453",
  "0543ddf4-af78-4fbd-bdde-4c585df19003", "431ec26c-b445-4908-ad5e-f25b4417e089",
  "f7a8894f-b4d4-4373-82ab-9c87f4c658fd", "fd2854b4-6039-460c-a3ed-4a1342363d2d",
  "dcdd16ab-13ef-47dc-b835-574384f9061c",
  "f56454b2-06a1-40d4-9901-e6788266c46a", "05830f97-d278-4ce0-850b-f2ae61c0102b",
  "cf42920e-1366-433e-acdb-caa31cedf6e1", "7242fd72-b070-4685-ae6e-b5e42b548d84",
  "5308771e-f7e1-480d-aaf2-d3ac88bb7458", "e5028168-2858-4f89-8c06-7b9137736f65", "880a65d4-3d3c-4d11-9429-2dc6be054753",
  "a28d81c4-a87c-43fe-868c-ffae79575daf", "5a77a8a0-bd7a-4075-aa0c-0e9a4fd0710d",
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

    const methodRes = await queryWithBypass<{ id: string }>(
      pool,
      `SELECT id::text FROM catalogs.payment_methods WHERE operating_company_id = $1::uuid AND display_name = 'Driver Net-Pay Clearing' LIMIT 1`,
      [USMCA_ID]
    );
    const paymentMethodId = methodRes.rows[0]?.id;
    if (!paymentMethodId) throw new Error('"Driver Net-Pay Clearing" payment method not found live -- refusing to guess an account');

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
      [USMCA_ID, TARGET_SETTLEMENTS]
    );
    if (settlementsRes.rows.length !== TARGET_SETTLEMENTS.length) {
      throw new Error(`Expected ${TARGET_SETTLEMENTS.length} settlements, found ${settlementsRes.rows.length} -- STOP`);
    }

    if (dryRun) {
      console.log("DRY_RUN=1 -- pre-checks only, no writes attempted.");
      console.log(JSON.stringify(settlementsRes.rows, null, 2));
      return;
    }

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
      console.log(`Deactivated ${res.rowCount} escrow_contribution rows, documented.`);
    } catch (err) {
      await deactivateClient.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      deactivateClient.release();
    }

    for (const row of settlementsRes.rows) {
      if (!row.live_je_id) {
        console.log(`SKIP ${row.display_id}: no live (non-reversed) pay-run-close JE found -- already handled by a prior run`);
        results.push({ settlement: row.display_id, status: "already_handled" });
        continue;
      }
      console.log(`${row.display_id}: reversing live JE ${row.live_je_id}...`);
      const reversal = await reverseSettlementPayRun(
        { operatingCompanyId: USMCA_ID, settlementId: row.settlement_id, reason: "R-161 part 2 -- correcting AUTH-013: this settlement's escrow was correctly excluded (no Driver-Escrow line on the signed document); reversing to re-close with $0 escrow." },
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
