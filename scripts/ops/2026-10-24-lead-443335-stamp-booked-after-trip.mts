/**
 * LEAD 443.335 — run the booked-after-trip stop engine once for USMCA (the cron runs it every 15 min after deploy).
 * Each load in its own withLuciaBypass transaction, exactly like completeLoadsBookedAfterTrip (the delivery latch needs that
 * wrapper's after-commit queue). Dry run by default: the engine runs, the result is captured, then the transaction is
 * ROLLED BACK; --apply commits. --only=13700,... limits the loads.
 */
import {
  completeStopsFromFenceHistory,
  listLoadsBookedAfterTrip,
} from "../../apps/backend/src/telematics/stop-arrival-from-fence-history.service.ts";
import { withLuciaBypass } from "../../apps/backend/src/auth/db.ts";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const COMMIT = process.argv.includes("--apply");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

class DryRunRollback extends Error {
  constructor(public readonly payload: unknown) { super("dry-run rollback"); }
}
type Q = { query: (sql: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
const scope = async (client: Q) => client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [CO]);

const out: Record<string, unknown> = { mode: COMMIT ? "COMMIT" : "DRY RUN (each load ROLLED BACK)" };
let loads = await withLuciaBypass(async (client) => { await scope(client as never); return listLoadsBookedAfterTrip(client as never, CO); });
if (ONLY) loads = loads.filter((l) => ONLY.includes(l.load_number));
out.candidates = loads.map((l) => l.load_number);
const results: unknown[] = [];
for (const load of loads) {
  try {
    const r = await withLuciaBypass(async (client) => {
      const c = client as unknown as Q;
      await scope(c);
      const before = (await c.query(`SELECT status::text AS s FROM mdata.loads WHERE id = $1::uuid`, [load.load_id])).rows[0]?.s;
      const res = await completeStopsFromFenceHistory(client as never, CO, load);
      const after = (await c.query(`SELECT status::text AS s FROM mdata.loads WHERE id = $1::uuid`, [load.load_id])).rows[0]?.s;
      const stops = (await c.query(
        `SELECT sequence_number, stop_type::text, status::text, actual_arrival_at::text, actual_arrival_source, actual_departure_at::text
           FROM mdata.load_stops WHERE load_id = $1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`, [load.load_id])).rows;
      const payload = { ...res, status_before: before, status_after: after, stops_now: stops };
      if (!COMMIT || res.outcome !== "stamped") throw new DryRunRollback(payload);
      return payload;
    });
    results.push({ committed: true, ...r });
  } catch (e) {
    if (e instanceof DryRunRollback) results.push({ committed: false, ...(e.payload as object) });
    else results.push({ load_number: load.load_number, outcome: "error", detail: (e as Error).message });
  }
}
out.results = results;
console.log(JSON.stringify(out, null, 2));
process.exit(0);
