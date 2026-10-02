// Queue 6 (#24177 follow-up). Load-stop geofences duplicated by the pre-#24177 unserialised auto_dispatch bind: two
// ACTIVE geo.geofences rows share one label "load-<id>-stop-<seq>" in a company, so one truck entry wrote two events.
// Keep the OLDEST fence per label; DEACTIVATE (is_active = false) each newer duplicate. Not deleted: immutable
// geo.geofence_events rows reference them, and the preservation ledger keeps every observation.
// Dry run (default) only SELECTs the plan. --apply requires --auth AUTH-NNN, verified OPEN on main by the cc3 lib.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";

await run("dedupe_stop_fences", async (c: any, { apply }: { apply: boolean }) => {
  const plan = (await c.query(
    `WITH ranked AS (
       SELECT g.id, g.label, g.created_at,
              row_number() OVER (PARTITION BY g.operating_company_id, g.label ORDER BY g.created_at, g.id) AS rn,
              (SELECT count(*) FROM geo.geofence_events e WHERE e.geofence_id = g.id) AS events
         FROM geo.geofences g
        WHERE g.operating_company_id = $1::uuid AND g.is_active = true AND g.label LIKE 'load-%-stop-%')
     SELECT id::text, label, created_at, events::int FROM ranked WHERE rn > 1 ORDER BY label`,
    [USMCA]
  )).rows as Array<{ id: string; label: string; created_at: string; events: number }>;
  let deactivated = 0;
  if (apply && plan.length) {
    const r = await c.query(
      `UPDATE geo.geofences SET is_active = false, updated_at = now()
        WHERE operating_company_id = $1::uuid AND is_active = true AND id = ANY($2::uuid[])`,
      [USMCA, plan.map((p) => p.id)]
    );
    deactivated = r.rowCount ?? 0;
    if (deactivated !== plan.length) throw new Error(`expected ${plan.length} deactivations, got ${deactivated}`);
  }
  return { duplicate_labels: new Set(plan.map((p) => p.label)).size, fences_to_deactivate: plan.length, deactivated, events_on_duplicates: plan.reduce((n, p) => n + p.events, 0), ids: plan.map((p) => p.id) };
});
