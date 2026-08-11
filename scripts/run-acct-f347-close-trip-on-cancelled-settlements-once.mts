/**
 * ACCT-F347 — close the trip on settlements that were CANCELLED while still marked trip-open.
 *
 * Cancelling a load-bookended settlement never set trip_closed_at, and the close path never fires for
 * a cancelled settlement, so it stayed "open" forever. On prod this left FOUR USMCA drivers each with
 * a cancelled settlement whose anchor load was still alive, and openLoadBookendedSettlement handed
 * that cancelled settlement back instead of opening a new one — future load pay would have attached to
 * paperwork that can never pay out.
 *
 * The CODE fix (excluding cancelled/voided from both reuse sites) stops new occurrences. This closes
 * the trip on the rows already in that state, so the data says what the cancellation meant: this
 * settlement is finished and is not accumulating anything further.
 *
 * ★ THIS IS NOT A MONEY WRITE. trip_closed_at is a lifecycle marker, not a ledger column: no amount,
 * no posting, no status change. gross_pay / deductions_total / net_pay and every settlement line are
 * untouched, and the script asserts that afterwards. Cancelled settlements stay cancelled — this does
 * not resurrect, pay, or re-open anything.
 *
 * Usage: npx tsx scripts/run-acct-f347-close-trip-on-cancelled-settlements-once.mts [--commit]
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const MONEY_SNAPSHOT = `
  SELECT COALESCE(sum(gross_pay),0)::text AS gross,
         COALESCE(sum(deductions_total),0)::text AS deductions,
         COALESCE(sum(net_pay),0)::text AS net,
         count(*)::int AS rows,
         count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
    FROM driver_finance.driver_settlements
   WHERE operating_company_id = $1::uuid`;

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [USMCA]);
  await client.query("BEGIN");

  const before = (await client.query(MONEY_SNAPSHOT, [USMCA])).rows[0];

  const targets = await client.query<{ id: string; display_id: string; status: string }>(
    `SELECT s.id::text, s.display_id, s.status
       FROM driver_finance.driver_settlements s
       JOIN mdata.loads fl
         ON fl.id = s.first_load_id
        AND fl.operating_company_id = s.operating_company_id
        AND fl.soft_deleted_at IS NULL
      WHERE s.operating_company_id = $1::uuid
        AND s.settlement_model = 'load_bookended'
        AND s.trip_closed_at IS NULL
        AND s.first_load_id IS NOT NULL
        AND (s.status = 'cancelled' OR s.voided_at IS NOT NULL)
      ORDER BY s.display_id
      FOR UPDATE`,
    [USMCA]
  );
  if (targets.rows.length === 0) {
    console.log("[ACCT-F347] nothing to repair — no cancelled/voided settlement is trip-open with a live anchor");
    await client.query("ROLLBACK");
    process.exit(0);
  }
  console.log(`[ACCT-F347] targets: ${targets.rows.map((r) => `${r.display_id}(${r.status})`).join(", ")}`);

  const upd = await client.query(
    `UPDATE driver_finance.driver_settlements
        SET trip_closed_at = now(), updated_at = now()
      WHERE id = ANY($1::uuid[])
        AND operating_company_id = $2::uuid
        AND trip_closed_at IS NULL`,
    [targets.rows.map((r) => r.id), USMCA]
  );
  if (upd.rowCount !== targets.rows.length) {
    throw new Error(`expected ${targets.rows.length} rows closed, got ${upd.rowCount}`);
  }

  const after = (await client.query(MONEY_SNAPSHOT, [USMCA])).rows[0];
  console.log(`[ACCT-F347] money unchanged? gross ${before.gross}->${after.gross} · deductions ${before.deductions}->${after.deductions} · net ${before.net}->${after.net}`);
  if (before.gross !== after.gross || before.deductions !== after.deductions || before.net !== after.net) {
    throw new Error("settlement money moved — a lifecycle marker must never change amounts");
  }
  if (before.rows !== after.rows || before.cancelled !== after.cancelled) {
    throw new Error("settlement row count or cancelled count changed — nothing may be created or resurrected");
  }

  const remaining = await client.query(
    `SELECT count(*)::int AS n
       FROM driver_finance.driver_settlements s
       JOIN mdata.loads fl ON fl.id = s.first_load_id AND fl.soft_deleted_at IS NULL
      WHERE s.operating_company_id = $1::uuid AND s.settlement_model = 'load_bookended'
        AND s.trip_closed_at IS NULL AND (s.status = 'cancelled' OR s.voided_at IS NOT NULL)`,
    [USMCA]
  );
  if ((remaining.rows[0]?.n ?? 1) !== 0) throw new Error("cancelled-but-reusable settlements remain after the repair");

  if (COMMIT) {
    await client.query("COMMIT");
    console.log(`[ACCT-F347] COMMITTED — ${upd.rowCount} cancelled settlement(s) closed; 0 remain reusable.`);
  } else {
    await client.query("ROLLBACK");
    console.log(`[ACCT-F347] DRY RUN — ${upd.rowCount} would be closed, all assertions passed, rolled back.`);
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`[ACCT-F347] FAILED (rolled back): ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
