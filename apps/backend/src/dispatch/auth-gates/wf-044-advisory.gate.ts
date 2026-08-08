import { registerGate, type GateFn } from "./gate-registry.service.js";

/**
 * WF-044 — advise the dispatcher when the unit they are booking has PM outstanding.
 *
 * THIS GATE USED TO 500 EVERY BOOK LOAD. It queried
 *   SELECT scheduled_start_at FROM maintenance.work_orders WHERE ... AND category = 'pm'
 * and NEITHER COLUMN EXISTS on prod (verified via pg_attribute on br-fancy-credit-akjnd07a). Postgres
 * answered 42703 undefined_column, the gate registry surfaced it as a 500, and because this gate is
 * registered for book_load, assign_driver AND quick_assign, the failure blocked the entire
 * Book -> Assign -> Deliver path rather than degrading to "no advisory".
 *
 * The identical query had already been found and neutered in safety/anomaly/detector.service.ts
 * (detectPmDueAdvisory returns [] with a comment saying these columns do not exist) — but the copy
 * living here was left running, which is why the 500 survived that fix. Same defect, two homes.
 *
 * WHY THIS READS pm_alerts AND NOT work_orders. maintenance.work_orders has no scheduling-date column
 * at all (its real columns are wo_type / source_type / status / opened_at / work_started_at). PM due-ness
 * is not a work-order attribute in this schema; it is produced by the PM engine into
 * maintenance.pm_alerts (unit_id, pm_schedule_id, trigger_odometer, triggered_at, state), which is the
 * canonical "this unit has PM due" signal and carries the unit FK this gate needs.
 *
 * States: the CHECK constraint on prod allows open / acknowledged / scheduled / dismissed. 'open' and
 * 'acknowledged' are still outstanding and worth warning about; 'scheduled' already has a work order
 * attached and 'dismissed' was explicitly waved off, so neither should nag the dispatcher again.
 *
 * EXPECTED-STATE NOTE, recorded so nobody later reads silence as breakage: maintenance.pm_alerts is
 * currently 0 rows on prod (count 0 == n_live_tup 0, so genuinely empty rather than RLS-masked), and
 * all 24 pm_schedules are is_active=false with next_due_odometer NULL, while 0 of 183 units carry an
 * odometer_mi. So this advisory is correctly SILENT today and will start firing when the PM engine has
 * data. That is the difference between a gate that returns [] and one that throws: this one no longer
 * blocks booking either way.
 */
const wf044Gate: GateFn = async (ctx, client) => {
  if (!ctx.unit_uuid) return [];
  const res = await client.query<{ alert_id: string; triggered_at: string; label: string | null }>(
    `SELECT a.id::text        AS alert_id,
            a.triggered_at::text AS triggered_at,
            s.label           AS label
       FROM maintenance.pm_alerts a
       LEFT JOIN maintenance.pm_schedules s ON s.id = a.pm_schedule_id
      WHERE a.operating_company_id = $1::uuid
        AND a.unit_id = $2::uuid
        AND a.state IN ('open', 'acknowledged')
      ORDER BY a.triggered_at
      LIMIT 5`,
    [ctx.operating_company_id, ctx.unit_uuid]
  );
  return res.rows.map((row) => ({
    workflow: "WF-044",
    kind: "warning" as const,
    message: `Unit has PM due${row.label ? ` (${row.label})` : ""} since ${row.triggered_at}`,
    evidence: { pm_alert_id: row.alert_id, triggered_at: row.triggered_at, pm_label: row.label },
  }));
};

registerGate("book_load", wf044Gate);
registerGate("assign_driver", wf044Gate);
registerGate("quick_assign", wf044Gate);
