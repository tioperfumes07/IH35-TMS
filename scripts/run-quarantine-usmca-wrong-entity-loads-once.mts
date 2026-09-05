#!/usr/bin/env tsx
/**
 * Quarantine the 29 Transportation load families that were seeded into USMCA before the
 * 2026-08-07 operating cutover was reconciled. Every family is processed in its own transaction
 * through cancelLoadInClientTx, the same canonical cancellation/void cascade used by the API.
 * Nothing is deleted or moved into Transportation.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/run-quarantine-usmca-wrong-entity-loads-once.mts
 *   DATABASE_URL=<prod> npx tsx scripts/run-quarantine-usmca-wrong-entity-loads-once.mts --commit
 */
import pg from "pg";
import { cancelLoadInClientTx } from "../apps/backend/src/dispatch/cancellation.service.js";
import { appendCrudAudit } from "../apps/backend/src/audit/crud-audit.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_NUMBERS = [
  "13471", "13480", "13482", "13484", "13485", "13486", "13487", "13488", "13491", "13492",
  "13493", "13494", "13495", "13496", "13497", "13498", "13499", "13500", "13503", "13504",
  "13506", "13509", "13517", "13524", "13527", "13531", "13533", "13539", "13540",
] as const;
const VOID_REASON =
  "WRONG ENTITY — TRANSPORTATION (pre-cutover 2026-08-07 / Transportation Faro) — owner 13:36Z";
const QUARANTINE_MEMO = "TRANSPORTATION-NOT-USMCA-2026-08-07-CUTOFF";
const APPLY = process.argv.includes("--commit");

type Snapshot = {
  loads: number;
  invoices: number;
  expenses: number;
  driver_bills: number;
  settlements: number;
  journal_entries: number;
};

async function setScope(client: pg.PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [OWNER_USER_ID]);
  await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
}

async function snapshot(client: pg.PoolClient, loadId: string): Promise<Snapshot> {
  const result = await client.query<Snapshot>(
    `SELECT
       (SELECT count(*)::int FROM mdata.loads l WHERE l.id=$1::uuid AND l.status='cancelled') AS loads,
       (SELECT count(*)::int FROM accounting.invoices i WHERE i.source_load_id=$1::uuid AND i.status='void') AS invoices,
       (SELECT count(*)::int FROM accounting.expenses e WHERE e.load_id=$1::uuid AND e.status='void') AS expenses,
       (SELECT count(*)::int FROM driver_finance.driver_bills b WHERE b.load_id=$1::uuid AND b.status='void') AS driver_bills,
       (SELECT count(DISTINCT ds.id)::int
          FROM driver_finance.settlement_lines sl
          JOIN driver_finance.driver_settlements ds ON ds.id=sl.settlement_id
         WHERE sl.load_id=$1::uuid AND ds.status='cancelled') AS settlements,
       (SELECT count(DISTINCT je.id)::int
          FROM accounting.journal_entries je
          JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid=je.id
         WHERE je.operating_company_id=$2::uuid
           AND je.status='posted'
           AND (jep.source_transaction_id::text IN (
             SELECT i.id::text FROM accounting.invoices i WHERE i.source_load_id=$1::uuid
             UNION ALL SELECT e.id::text FROM accounting.expenses e WHERE e.load_id=$1::uuid
           ))
           AND (je.memo ILIKE 'Void reversal%' OR je.memo ILIKE 'Reversal%')) AS journal_entries`,
    [loadId, USMCA]
  );
  return result.rows[0]!;
}

function delta(after: Snapshot, before: Snapshot): Snapshot {
  return Object.fromEntries(
    Object.keys(after).map((key) => [key, Number(after[key as keyof Snapshot]) - Number(before[key as keyof Snapshot])])
  ) as Snapshot;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
  if (!connectionString) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");
  const pool = new pg.Pool({ connectionString, max: 1 });
  const totals: Snapshot = { loads: 0, invoices: 0, expenses: 0, driver_bills: 0, settlements: 0, journal_entries: 0 };
  try {
    for (const loadNumber of LOAD_NUMBERS) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setScope(client);
        const loadResult = await client.query<{ id: string; status: string; is_sample_data: boolean }>(
          `SELECT id::text, status::text, COALESCE(is_sample_data,false) AS is_sample_data,
                  soft_deleted_at::text AS soft_deleted_at
             FROM mdata.loads
            WHERE operating_company_id=$1::uuid AND load_number=$2
            FOR UPDATE`,
          [USMCA, loadNumber]
        );
        const load = loadResult.rows[0] as (typeof loadResult.rows)[number] & { soft_deleted_at: string | null };
        if (!load) throw new Error(`load_not_found:${loadNumber}`);
        const before = await snapshot(client, load.id);

        // A competing cleanup pass soft-deleted 21 of these rows at 13:55Z. Owner law requires the
        // quarantine to remain visible and the canonical cancel service intentionally refuses
        // soft-deleted loads. Restore first in this SAME transaction, audit it, then cancel.
        if (load.soft_deleted_at) {
          await client.query(
            `UPDATE mdata.loads
                SET soft_deleted_at=NULL, deleted_by_user_id=NULL, updated_at=now()
              WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
            [load.id, USMCA]
          );
          await appendCrudAudit(
            client,
            OWNER_USER_ID,
            "mdata.loads.restored_for_wrong_entity_void",
            {
              resource_type: "mdata.loads",
              resource_id: load.id,
              operating_company_id: USMCA,
              prior_soft_deleted_at: load.soft_deleted_at,
              reason: VOID_REASON,
            },
            "warning",
            "USMCA-WRONG-ENTITY-QUARANTINE"
          );
        }

        const blockers = await client.query<{ kind: string; id: string; status: string }>(
          `SELECT 'invoice' AS kind, id::text, status::text FROM accounting.invoices
             WHERE source_load_id=$1::uuid AND operating_company_id=$2::uuid AND status IN ('paid','factored')
           UNION ALL
           SELECT 'settlement', ds.id::text, ds.status::text
             FROM driver_finance.settlement_lines sl
             JOIN driver_finance.driver_settlements ds ON ds.id=sl.settlement_id
            WHERE sl.load_id=$1::uuid AND ds.operating_company_id=$2::uuid AND ds.status='paid'
           UNION ALL
           SELECT 'advance', a.id::text, 'paid_to_date=' || COALESCE(dl.paid_to_date::text,'0')
             FROM driver_finance.driver_advances a
             JOIN driver_finance.driver_liabilities dl ON dl.id=a.liability_id
            WHERE a.load_id=$1::uuid AND a.operating_company_id=$2::uuid AND COALESCE(dl.paid_to_date,0)>0`,
          [load.id, USMCA]
        );
        if (blockers.rows.length) {
          throw new Error(`unvoidable_money:${loadNumber}:${JSON.stringify(blockers.rows)}`);
        }

        if (load.status !== "cancelled") {
          await cancelLoadInClientTx(client, OWNER_USER_ID, "Owner", {
            operating_company_id: USMCA,
            load_id: load.id,
            reason_code: "OTHER",
            cancellation_notes: VOID_REASON,
            billable_to_customer: false,
          });
        }

        await client.query(
          `UPDATE mdata.loads
              SET is_sample_data=true,
                  notes=CASE
                    WHEN COALESCE(notes,'') ILIKE '%' || $3 || '%' THEN notes
                    WHEN NULLIF(BTRIM(notes),'') IS NULL THEN $3
                    ELSE notes || E'\\n' || $3
                  END,
                  updated_at=now()
            WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [load.id, USMCA, QUARANTINE_MEMO]
        );
        const after = await snapshot(client, load.id);
        const changed = delta(after, before);
        for (const key of Object.keys(totals) as Array<keyof Snapshot>) totals[key] += changed[key];

        if (APPLY) await client.query("COMMIT");
        else await client.query("ROLLBACK");
        console.log(
          `${APPLY ? "VOIDED" : "DRY-RUN"} ${loadNumber} id=${load.id} status=${load.status} restored=${Boolean(load.soft_deleted_at)} ` +
          `delta=${JSON.stringify(changed)} final=${JSON.stringify(after)}`
        );
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
    console.log(`${APPLY ? "COMMITTED" : "DRY-RUN COMPLETE"} loads=${LOAD_NUMBERS.length} changes=${JSON.stringify(totals)}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("QUARANTINE BLOCKED:", error);
  process.exit(1);
});
