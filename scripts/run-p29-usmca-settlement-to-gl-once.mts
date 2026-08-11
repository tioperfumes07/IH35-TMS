/**
 * P29 (29 OF 50) — settlement → GL. Drive a real USMCA settlement through the CANONICAL lifecycle
 * until driver_finance.driver_settlement_gl_runs / gl_bills are non-zero and the JE nets 0.
 *
 * Prod before this ran: 0 gl_runs and 0 gl_bills on EVERY entity — this path had never executed
 * anywhere, so nothing proved the settlement money chain reaches the ledger at all.
 *
 * ★ THE POSTER I DID NOT USE. postSettlementToGl exists and has zero callers, which looks exactly like
 * an unwired path waiting to be connected. It is not: SET-01 (2026-07-26) RETIRED it because it
 * mis-routes escrow / cash-advance into generic {type}_recovery buckets, its HTTP entry returns 308 to
 * the canonical route, and verify-no-deprecated-settlement-poster-mounted.mjs exists to stop it being
 * re-mounted. An uncalled function is not automatically an unwired one — sometimes it is a retired
 * one, and re-wiring it would have re-introduced a known money-routing bug.
 *
 * CANONICAL CHAIN, every step an existing entry point — no new GL math anywhere:
 *   1. buildWeeklyCloseDraftForDriver  → settlement 'presettle' + settlement_lines.source_driver_bill_id
 *   2. acknowledge                     → 'acked'   (records acknowledged_by_user_id — auditable actor)
 *   3. lock                            → 'locked'  (POSTABLE_STATUSES gate)
 *   4. postSettlementBillPayment       → gl_runs + gl_bills + balanced Bill/BillPayment JE
 *
 * Steps 1–3 run inside ONE transaction and roll back unless --commit. Step 4 opens its own pooled
 * connection inside the poster, so it CANNOT participate in that rollback — it therefore runs only
 * with --commit, after 1–3 have committed and been re-read from the database.
 *
 * Usage: npx tsx scripts/run-p29-usmca-settlement-to-gl-once.mts [--commit]
 */
import pg from "pg";
import { buildWeeklyCloseDraftForDriver } from "../apps/backend/src/driver-finance/weekly-close.routes.ts";
import { postSettlementBillPayment } from "../apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVER = "c864a4bb-a7ff-4373-a5e1-c1590eefe3b7"; // Rafael Rogelio Rivero Reynoso
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const WEEK_START = "2026-08-10";
const WEEK_END = "2026-08-16";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

async function glCounts(c: pg.PoolClient) {
  const r = await c.query<{ runs: string; bills: string }>(
    `SELECT (SELECT count(*) FROM driver_finance.driver_settlement_gl_runs WHERE operating_company_id=$1::uuid)::text AS runs,
            (SELECT count(*) FROM driver_finance.driver_settlement_gl_bills WHERE operating_company_id=$1::uuid)::text AS bills`,
    [USMCA]
  );
  return r.rows[0];
}

let settlementId = "";
try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [USMCA]);

  const before = await glCounts(client);
  console.log(`[P29] pre : gl_runs=${before.runs} gl_bills=${before.bills}`);

  await client.query("BEGIN");

  // ── 1 · draft with bill-linked lines ───────────────────────────────────────────────────────────
  const draft = await buildWeeklyCloseDraftForDriver(client as never, {
    operatingCompanyId: USMCA,
    driverId: DRIVER,
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    actorUserId: ACTOR,
  });
  if (!draft) throw new Error("weekly-close produced no draft for this driver/week — nothing to post");
  settlementId = draft.draftSettlementId;

  const linked = await client.query<{ display_id: string; lines: string; linked: string; total: string }>(
    `SELECT s.display_id,
            (SELECT count(*) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id=s.id)::text AS lines,
            (SELECT count(*) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id=s.id AND sl.source_driver_bill_id IS NOT NULL)::text AS linked,
            (SELECT COALESCE(sum(sl.amount),0) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id=s.id)::text AS total
       FROM driver_finance.driver_settlements s WHERE s.id=$1::uuid`,
    [settlementId]
  );
  const L = linked.rows[0];
  console.log(`[P29] draft ${L.display_id} · lines=${L.lines} bill-linked=${L.linked} total=${L.total}`);
  if (Number(L.linked) === 0) {
    throw new Error("no settlement_line carries source_driver_bill_id — the poster would find NO_LOAD_BILLS; refusing to continue");
  }

  // ── 2 · acknowledge (same columns the canonical PATCH .../acknowledge route writes) ─────────────
  await client.query(
    `UPDATE driver_finance.driver_settlements
        SET acknowledged_at = now(), acknowledged_by_user_id = $2::uuid,
            status = CASE WHEN status = 'presettle' THEN 'acked' ELSE status END, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
    [settlementId, ACTOR, USMCA]
  );

  // ── 3 · lock (the gate postSettlementBillPayment checks via POSTABLE_STATUSES) ──────────────────
  const lock = await client.query(
    `UPDATE driver_finance.driver_settlements
        SET status = 'locked', locked_at = now(), updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND locked_at IS NULL`,
    [settlementId, USMCA]
  );
  if (lock.rowCount !== 1) throw new Error(`expected to lock exactly 1 settlement, locked ${lock.rowCount}`);
  console.log(`[P29] acked + locked ${L.display_id}`);

  if (!COMMIT) {
    await client.query("ROLLBACK");
    console.log("[P29] DRY RUN — draft/ack/lock verified and rolled back. The GL post (step 4) needs --commit: the poster opens its own connection and cannot join this transaction.");
    process.exit(0);
  }
  await client.query("COMMIT");
  console.log(`[P29] COMMITTED steps 1-3 · settlement=${settlementId}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`[P29] FAILED before posting (rolled back): ${(err as Error)?.message ?? err}`);
  client.release();
  await pool.end();
  process.exit(1);
}

// ── 4 · post to GL through the canonical Bill+BillPayment poster ─────────────────────────────────
try {
  const result = await postSettlementBillPayment(
    { operatingCompanyId: USMCA, settlementId },
    { userId: ACTOR } as never
  );
  console.log(`[P29] poster result: ${JSON.stringify(result)}`);

  const after = await glCounts(client);
  console.log(`[P29] post: gl_runs=${after.runs} gl_bills=${after.bills}`);
  if (Number(after.runs) < 1 || Number(after.bills) < 1) {
    throw new Error(`expected gl_runs and gl_bills > 0, got runs=${after.runs} bills=${after.bills}`);
  }

  // The JE the poster produced must balance — read it back from the ledger, not from the return value.
  const je = await client.query<{ jes: string; net: string }>(
    `SELECT count(DISTINCT jep.journal_entry_uuid)::text AS jes,
            COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)::text AS net
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE je.operating_company_id = $1::uuid
        AND jep.source_transaction_id = ANY (
          SELECT b.bill_id::text FROM driver_finance.driver_settlement_gl_bills b
           WHERE b.operating_company_id = $1::uuid AND b.settlement_id = $2::uuid
        )`,
    [USMCA, settlementId]
  );
  console.log(`[P29] settlement JEs=${je.rows[0].jes} · net=${je.rows[0].net}c`);
  if (je.rows[0].net !== "0") throw new Error(`settlement GL does not balance: net ${je.rows[0].net}c`);

  console.log("[P29] BUILT — settlement posted to GL: gl_runs + gl_bills > 0 and the JE nets 0.");
} catch (err) {
  console.error(`[P29] POST FAILED: ${(err as Error)?.message ?? err}`);
  console.error("[P29] steps 1-3 ARE COMMITTED (settlement locked). Reverse with reverseSettlementGlPosting if a partial run exists.");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
