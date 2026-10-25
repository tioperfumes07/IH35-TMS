/**
 * LEAD 443.339 (ENG-61) — 13699 (Eduardo Azael Flores Ortiz) and 13700 (Rafael Rogelio Rivero Reynoso) were delivered on
 * 10-24 by the 443.335 engine, but their final-load settlement close raised (status='closed' without posted_at) inside the
 * ping savepoint and rolled back: open pre-settlements a41008ca / 6ba08647 with no lines. Re-run the ONE settlement ping
 * (pingSettlementOnLoadEvent, delivered_pending_docs) with the fixed close, inside withLuciaBypass so the after-commit GL
 * post (postLoadBookendedSettlementGlAfterClose → closeSettlementPayRun) runs once the close commits.
 * Dry run: the ping runs and the transaction is ROLLED BACK (no post). --apply commits and lets the post run.
 */
import { withLuciaBypass } from "../../apps/backend/src/auth/db.ts";
import { pingSettlementOnLoadEvent } from "../../apps/backend/src/driver-finance/settlements-load-bookended.service.ts";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOADS = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "13699,13700").split(",");
const COMMIT = process.argv.includes("--apply");
class Rollback extends Error { constructor(public p: unknown) { super("dry-run"); } }
type Q = { query: (s: string, v?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };

const state = async (loadNumber: string) => withLuciaBypass(async (client) => {
  const c = client as unknown as Q;
  return (await c.query(
    `SELECT l.load_number, l.status::text AS load_status, s.display_id, s.status, s.trip_closed_at::text, s.posted_at::text,
            s.gross_pay::text, s.deductions_total::text, s.net_pay::text,
            (SELECT count(*) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.is_active)::int AS active_lines
       FROM mdata.loads l LEFT JOIN driver_finance.driver_settlements s ON s.id = l.presettlement_link_id
      WHERE l.operating_company_id = $1::uuid AND l.load_number = $2`, [CO, loadNumber])).rows[0];
});

const out: unknown[] = [];
for (const n of LOADS) {
  const before = await state(n);
  try {
    await withLuciaBypass(async (client) => {
      const c = client as unknown as Q;
      await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [CO]);
      const load = (await c.query(`SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2`, [CO, n])).rows[0];
      await pingSettlementOnLoadEvent(client as never, { loadId: load.id, operatingCompanyId: CO, dispatchTargetStatus: "delivered_pending_docs", actorUserId: ACTOR } as never);
      const mid = (await c.query(
        `SELECT s.display_id, s.status, s.trip_closed_at::text, (SELECT count(*) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.is_active)::int AS active_lines, s.net_pay::text
           FROM driver_finance.driver_settlements s JOIN mdata.loads l ON l.presettlement_link_id = s.id WHERE l.id = $1::uuid`, [load.id])).rows[0];
      if (!COMMIT) throw new Rollback(mid);
    });
    await new Promise((r) => setTimeout(r, 4000)); // after-commit post runs on its own connection
    out.push({ load: n, before, after: await state(n) });
  } catch (e) {
    if (e instanceof Rollback) out.push({ load: n, before, dry_run_inside_tx: e.p });
    else { console.error((e as any).stack, (e as any).detail, (e as any).where); out.push({ load: n, before, error: (e as Error).message }); }
  }
}
console.log(JSON.stringify({ mode: COMMIT ? "COMMIT" : "DRY RUN (ROLLED BACK)", out }, null, 2));
process.exit(0);
