/**
 * R-160 (Lead, 2026-09-25 11:05 AM CT/16:05Z, deadline 19:00Z, FIRST PRIORITY, before R-159) --
 * owner ruling: "only usmca... all expenses related to the shared settlements are for usmca... in
 * our settlement it should only show our load, for usmca, and all expenses are attributed to
 * usmca. so our settlements will probably show a loss."
 *
 * 13 loads were Faro-purchased on the TRANSPORTATION portal (confirmed live against the owner's
 * own authority file, ~/Desktop/IH35-AUGUST-RECONCILIATION-BOTH-ENTITIES.xlsx, sheet "6 FARO ·
 * TRANSPORTATION" -- every one of the 13 Lead named is present there with a real Faro purchase
 * row) but their invoice + load records were created in USMCA:
 *   13497, 13502, 13503, 13504, 13505, 13506, 13507, 13509, 13522, 13530, 13531, 13533, 13539
 *
 * FOR EACH:
 *   1. Void the USMCA invoice via the real bulk-void service (voidInvoiceInBulk,
 *      apps/backend/src/accounting/bulk-void.service.ts -- the SAME reversing-JE + cascade-void +
 *      audit primitives the interactive POST /invoices/:id/void route uses, without that route's
 *      TMS-push/accounting-spine side effects, which do not belong on a backfilled correction).
 *   2. Soft-delete the USMCA load (soft_deleted_at/deleted_by_user_id, the exact same two-column
 *      write PATCH /api/v1/loads/:id itself performs -- copied verbatim, not reimplemented) plus
 *      an appendCrudAudit entry. NOT cancelLoadInClientTx: rehearsal caught, before any production
 *      write, that it cascades to CANCEL THE ENTIRE SETTLEMENT for every settlement any of its
 *      lines touch ("VOID-CASCADE-SETTLEMENTS", cancellation.service.ts) whenever that settlement
 *      isn't already paid/cancelled -- live-confirmed all 13 target loads' settlements are
 *      status='approved' (not paid), so that cascade would fire for real and destroy the OTHER,
 *      legitimate USMCA loads' settlement data sharing the same settlement -- exactly what R-160
 *      orders 2-3 require to survive intact. soft_deleted_at is the correct primitive here: it is
 *      the SAME "no longer live" filter (`soft_deleted_at IS NULL`) every load list/read endpoint
 *      already applies everywhere in this codebase, touches no other table, cascades to nothing,
 *      and is fully void-never-delete compliant (the row and all its data persist untouched).
 *   3. Re-link every accounting.expenses.load_id, driver_finance.settlement_lines.load_id, and
 *      driver_finance.driver_bills.load_id/load_number row currently pointing at this load: to the
 *      ONE other USMCA load on the SAME settlement when
 *      there is EXACTLY one (live-confirmed against the settlement_lines join before writing this
 *      -- 3 settlements qualify: 5773->13511, 5780->13532, 5786->13548); otherwise to NULL (the
 *      settlement/driver linkage the row already carries is untouched -- only load_id changes, so
 *      the expense/deduction/earning stays exactly where the owner ordered: on USMCA's settlement,
 *      just no longer pointing at the now-cancelled Transportation load). Settlements with 0 or 2+
 *      other USMCA loads are listed in this script's own output, never guessed to a specific one.
 *
 * Void, never delete. Nothing is written to TRANSP. Touches exactly these 13 named loads/invoices
 * and the rows that reference them.
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
const VOID_REASON = "Transportation load — Faro Transportation portal (Aug reconciliation sheet 6, R-160)";
const CANCEL_NOTES = "Transportation load recorded in USMCA by error — Faro-purchased on the Transportation portal (Aug 2026 reconciliation, sheet 6 FARO · TRANSPORTATION), not a USMCA load. R-160.";

const TARGET_LOADS = [
  "13497", "13502", "13503", "13504", "13505", "13506", "13507",
  "13509", "13522", "13530", "13531", "13533", "13539",
];

// Live-confirmed before writing this: settlements with EXACTLY one other (non-target) USMCA load.
// Every other target-load's settlement has 0 or 2+ other loads and gets load_id set to NULL instead.
const RELINK_TARGET_USMCA_LOAD: Record<string, string> = {
  "13497": "13511",
  "13530": "13532",
  "13533": "13548",
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
  const { voidInvoiceInBulk } = await import("../../apps/backend/src/accounting/bulk-void.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";
  const results: Array<Record<string, unknown>> = [];

  try {
    // READ PHASE, entirely separate from the write phase below (this session's own Set B lesson,
    // AUTH-013: reads interleaved with writes on this Neon pooled endpoint have returned
    // false-empty results under real concurrent load).
    const rowsRes = await queryWithBypass<{
      load_number: string; load_id: string; invoice_id: string; relink_load_id: string | null;
      relink_load_number: string | null;
    }>(
      pool,
      `SELECT l.load_number, l.id::text AS load_id, inv.id::text AS invoice_id,
              relink.id::text AS relink_load_id, relink.load_number AS relink_load_number
         FROM mdata.loads l
         JOIN accounting.invoice_lines il ON il.source_load_id = l.id
         JOIN accounting.invoices inv ON inv.id = il.invoice_id
         LEFT JOIN mdata.loads relink ON relink.load_number = ANY(
           CASE WHEN l.load_number = ANY($2::text[]) THEN ARRAY[
             CASE l.load_number
               WHEN '13497' THEN '13511' WHEN '13530' THEN '13532' WHEN '13533' THEN '13548'
             END
           ] ELSE ARRAY[]::text[] END
         ) AND relink.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($3::text[])`,
      [USMCA_ID, Object.keys(RELINK_TARGET_USMCA_LOAD), TARGET_LOADS]
    );
    if (rowsRes.rows.length !== TARGET_LOADS.length) {
      throw new Error(`Expected ${TARGET_LOADS.length} loads, found ${rowsRes.rows.length} -- STOP`);
    }
    for (const r of rowsRes.rows) {
      const expected = RELINK_TARGET_USMCA_LOAD[r.load_number];
      if (expected && r.relink_load_number !== expected) {
        throw new Error(`${r.load_number}: expected relink target ${expected}, resolved ${r.relink_load_number} -- STOP, shape changed since investigation`);
      }
    }
    console.log(`Resolved all ${rowsRes.rows.length} loads up front (read phase complete, no writes yet).`);

    for (const row of rowsRes.rows) {
      console.log(`${row.load_number}: load=${row.load_id} invoice=${row.invoice_id} relink_to=${row.relink_load_number ?? "NULL (listed, not exactly one USMCA load on this settlement)"}`);
      if (dryRun) {
        results.push({ load_number: row.load_number, status: "dry_run_would_void_and_cancel", relink_to: row.relink_load_number });
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

        const voidResult = await voidInvoiceInBulk(
          {
            id: row.invoice_id,
            action: "void",
            payload: {},
            reason: VOID_REASON,
            operatingCompanyId: USMCA_ID,
            actorUserId: SYSTEM_ACTOR_USER_ID,
            actorRole: "Owner",
            bulkCallId: `r160-${row.load_number}`,
            client,
          },
          "Owner"
        );
        if (!voidResult.ok) {
          const failure = voidResult as { ok: false; code: string; message: string };
          throw new Error(`${row.load_number}: invoice void failed -- ${failure.code} ${failure.message}`);
        }

        // Relink FIRST, soft-delete the load LAST -- ACCT-F5683 (migration 202612870000) is a
        // DATABASE TRIGGER on mdata.loads that refuses soft_deleted_at when an open
        // driver_finance.driver_bills row still references the load (found live in rehearsal,
        // before any production write). Relinking driver_bills.load_id/load_number away from this
        // load first (same "exactly one USMCA load, else NULL" rule as expenses/settlement_lines --
        // driver_finance.driver_bills is CC-1's own table, LANES.md) satisfies the trigger's own
        // check honestly, not by voiding/settling a real payable as an automatic side effect (the
        // trigger's own comment explicitly forbids that).
        const expRes = await client.query(
          `UPDATE accounting.expenses SET load_id = $2::uuid, updated_at = now()
            WHERE load_id = $1::uuid AND operating_company_id = $3::uuid AND voided_at IS NULL
          RETURNING id`,
          [row.load_id, row.relink_load_id, USMCA_ID]
        );
        const slRes = await client.query(
          `UPDATE driver_finance.settlement_lines SET load_id = $2::uuid, updated_at = now()
            WHERE load_id = $1::uuid AND operating_company_id = $3::uuid AND is_active = true
          RETURNING id`,
          [row.load_id, row.relink_load_id, USMCA_ID]
        );
        const dbRes = await client.query(
          `UPDATE driver_finance.driver_bills SET load_id = $2::uuid, load_number = $3, updated_at = now()
            WHERE load_id = $1::uuid AND operating_company_id = $4::uuid AND voided_at IS NULL
          RETURNING id`,
          [row.load_id, row.relink_load_id, row.relink_load_number, USMCA_ID]
        );

        // Soft-delete only -- the exact same two-column write PATCH /api/v1/loads/:id performs for
        // soft_deleted_at (mdata/loads.routes.ts). NOT cancelLoadInClientTx: it cascades to cancel
        // the ENTIRE settlement for every settlement any of the load's lines touch, which would
        // destroy the OTHER, legitimate USMCA loads sharing that settlement.
        const softDeleteRes = await client.query(
          `UPDATE mdata.loads SET soft_deleted_at = now(), deleted_by_user_id = $2::uuid, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $3::uuid AND soft_deleted_at IS NULL
          RETURNING id`,
          [row.load_id, SYSTEM_ACTOR_USER_ID, USMCA_ID]
        );
        if (softDeleteRes.rowCount !== 1) throw new Error(`${row.load_number}: soft-delete affected ${softDeleteRes.rowCount} rows, expected 1 -- STOP`);
        await appendCrudAudit(
          client,
          SYSTEM_ACTOR_USER_ID,
          "mdata.loads.soft_deleted",
          { resource_type: "mdata.loads", resource_id: row.load_id, operating_company_id: USMCA_ID, reason: CANCEL_NOTES },
          "warning",
          "R-160"
        );

        await client.query("COMMIT");
        console.log(`  voided invoice, soft-deleted load, relinked ${expRes.rowCount} expenses + ${slRes.rowCount} settlement_lines + ${dbRes.rowCount} driver_bills`);
        results.push({
          load_number: row.load_number,
          status: "voided_and_cancelled",
          relink_to: row.relink_load_number,
          expenses_relinked: expRes.rowCount,
          settlement_lines_relinked: slRes.rowCount,
          driver_bills_relinked: dbRes.rowCount,
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
