// ROUND 330.7. telematics.unit_stop_events holds the SAME physical stop many times: a stop already in progress when the
// writer's 36 h window opened was clipped to the window's first fix, a later start on every 15-min tick, so the
// (unit_id, started_at) key never matched (writer fixed in the same PR). Keep, per (unit_id, ended_at), the row with
// the EARLIEST started_at — the true start; every later start is a clipped copy — and DELETE the copies. No FK and no
// trigger references the table; the preservation ledger (preserve.unit_stop_events, WORM) keeps what was observed.
// Dry run (default) only SELECTs the plan. --apply requires --auth AUTH-NNN, verified OPEN on main by the cc3 lib.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";

await run("dedupe_unit_stop_events", async (c: any, { apply }: { apply: boolean }) => {
  const before = Number((await c.query(`SELECT count(*) n FROM telematics.unit_stop_events WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0].n);
  const plan = (await c.query(
    `WITH ranked AS (
       SELECT id, unit_id, started_at, ended_at,
              row_number() OVER (PARTITION BY unit_id, ended_at ORDER BY started_at, id) AS rn
         FROM telematics.unit_stop_events
        WHERE operating_company_id = $1::uuid AND ended_at IS NOT NULL)
     SELECT id::text FROM ranked WHERE rn > 1`,
    [USMCA]
  )).rows.map((r: { id: string }) => r.id) as string[];
  const groups = Number((await c.query(
    `SELECT count(*) n FROM (SELECT 1 FROM telematics.unit_stop_events WHERE operating_company_id = $1::uuid AND ended_at IS NOT NULL
      GROUP BY unit_id, ended_at HAVING count(*) > 1) d`, [USMCA])).rows[0].n);
  let deleted = 0;
  if (apply && plan.length) {
    const r = await c.query(`DELETE FROM telematics.unit_stop_events WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])`, [USMCA, plan]);
    deleted = r.rowCount ?? 0;
    if (deleted !== plan.length) throw new Error(`expected ${plan.length} deletions, got ${deleted}`);
  }
  const after = Number((await c.query(`SELECT count(*) n FROM telematics.unit_stop_events WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0].n);
  return { rows_before: before, stops_with_copies: groups, copies_to_delete: plan.length, deleted, rows_after: after };
}, { asTableOwner: true });
