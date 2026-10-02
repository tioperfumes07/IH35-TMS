// ROUND 330.7 / 337. telematics.unit_stop_events holds the SAME physical stop many times: a stop already in progress when
// the writer's 36 h window opened was clipped to the window's first fix — a later start on every 15-min tick — so the
// (unit_id, started_at) key never matched (writer fixed in #24254). ONE transaction, the Lead's order (ROUND 337):
//   1. preserve FIRST — copy every live row not yet in preserve.unit_stop_events (the WORM natural-key ledger), using the
//      preservation engine's own step SQL with no window; preserved_at = now()
//   2. ASSERT 0 live rows unmatched in preserve on (company_code, unit_number, started_at, ended_at) — else ROLLBACK
//   3. delete the copies, keeping row_number() OVER (PARTITION BY operating_company_id, unit_id, ended_at
//      ORDER BY started_at) = 1 (the true start)
// No FK and no trigger references the table. Dry run (default) rolls everything back. --apply requires --auth AUTH-NNN,
// verified OPEN on main by the cc3 lib.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { PRESERVE_STEPS } from "../../apps/backend/src/telematics/preservation.service.js";

const UNMATCHED = `
  SELECT count(*)::int n FROM telematics.unit_stop_events e
   WHERE e.operating_company_id = $1::uuid
     AND NOT EXISTS (SELECT 1 FROM preserve.unit_stop_events p
                      WHERE p.company_code = (SELECT c.code FROM org.companies c WHERE c.id = e.operating_company_id)
                        AND p.unit_number = coalesce((SELECT u.unit_number FROM mdata.units u WHERE u.id = e.unit_id), 'UNKNOWN-' || e.unit_id::text)
                        AND p.started_at = e.started_at AND p.ended_at IS NOT DISTINCT FROM e.ended_at)`;

await run("dedupe_unit_stop_events", async (c: any, { apply }: { apply: boolean }) => {
  const count = async () => Number((await c.query(`SELECT count(*) n FROM telematics.unit_stop_events WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0].n);
  const preserved = async () => Number((await c.query(`SELECT count(*) n FROM preserve.unit_stop_events`)).rows[0].n);
  const rows_before = await count();
  const preserve_before = await preserved();
  const unmatched_before = Number((await c.query(UNMATCHED, [USMCA])).rows[0].n);
  // a live row whose stop GREW after it was preserved: same natural key start, a later end — the PK keeps the first
  const grown_since_preserved = Number((await c.query(`
    SELECT count(*)::int n FROM telematics.unit_stop_events e
      JOIN preserve.unit_stop_events p
        ON p.company_code = (SELECT c.code FROM org.companies c WHERE c.id = e.operating_company_id)
       AND p.unit_number = coalesce((SELECT u.unit_number FROM mdata.units u WHERE u.id = e.unit_id), 'UNKNOWN-' || e.unit_id::text)
       AND p.started_at = e.started_at
     WHERE e.operating_company_id = $1::uuid AND p.ended_at IS DISTINCT FROM e.ended_at`, [USMCA])).rows[0].n);

  // 1. preserve first — the engine's own unit_stop_events step, no window
  const step = PRESERVE_STEPS(null).find((s) => s.table === "unit_stop_events");
  if (!step) throw new Error("preservation step unit_stop_events not found");
  const ins = await c.query(step.sql);
  const preserved_inserted = ins.rowCount ?? 0;

  // 2. assert nothing is left unpreserved
  const unmatched_after = Number((await c.query(UNMATCHED, [USMCA])).rows[0].n);

  const plan = (await c.query(
    `SELECT id::text FROM (SELECT id, row_number() OVER (PARTITION BY operating_company_id, unit_id, ended_at ORDER BY started_at, id) rn
                             FROM telematics.unit_stop_events WHERE operating_company_id = $1::uuid AND ended_at IS NOT NULL) x WHERE rn > 1`,
    [USMCA])).rows.map((r: { id: string }) => r.id) as string[];
  // of the rows the delete would remove, how many are still unmatched (the only rows a delete could lose)
  const unmatched_among_deletions = Number((await c.query(UNMATCHED.replace("WHERE e.operating_company_id = $1::uuid", "WHERE e.operating_company_id = $1::uuid AND e.id = ANY($2::uuid[])"), [USMCA, plan])).rows[0].n);
  const result = { unmatched_among_deletions, rows_before, preserve_before, unmatched_before, grown_since_preserved, preserved_inserted, unmatched_after, copies_to_delete: plan.length, deleted: 0, rows_after: rows_before };
  if (unmatched_after !== 0) throw new Error(`ROLLBACK: ${unmatched_after} live rows still unmatched in preserve after the backfill — not deleting ${JSON.stringify(result)}`);

  // 3. delete the copies
  const del = await c.query(`DELETE FROM telematics.unit_stop_events WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])`, [USMCA, plan]);
  result.deleted = del.rowCount ?? 0;
  if (result.deleted !== plan.length) throw new Error(`expected ${plan.length} deletions, got ${result.deleted}`);
  result.rows_after = await count();
  void apply;
  return result;
}, { asTableOwner: true });
