/**
 * LEAD 443.126 2b — a Relay fuel backfill run is durable, not just a background promise.
 *
 * The run lives in audit.audit_events (source RELAY-FUEL-INGEST-1): one `..._backfill_started` row, one
 * `..._backfill_window` heartbeat per committed window (run id, window, the instance that ran it), and one terminal row
 * (`_completed` / `_failed` / `_interrupted`). A deploy replaces the instance mid-run and the in-memory promise dies with
 * it, so before this a killed run read "running" forever (run 193d5ce1, 2026-10-12: last window 09-22..09-28, instance
 * replaced by the 18:19 UTC deploy).
 *
 * Now:
 *   - a run with no terminal row and no heartbeat for BACKFILL_STALE_MINUTES reads `interrupted`, with its last window;
 *   - the next start closes it durably (`_interrupted`, last_window_end) before anything else;
 *   - a start with `resume: true` continues from the interrupted run's last window + 1 day (same months horizon);
 *   - a start while a run is live (fresh heartbeat, no terminal) is refused — never two concurrent runs per company.
 */
export const RELAY_BACKFILL_AUDIT_SOURCE = "RELAY-FUEL-INGEST-1";
/** A window takes about a minute (one paced Relay call + one commit); ten silent minutes means the worker is gone. */
export const BACKFILL_STALE_MINUTES = 10;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type BackfillRunState = {
  run_id: string;
  status: "running" | "completed" | "failed" | "interrupted";
  months: number;
  started_at: string;
  completed_at: string | null;
  pulled: number | null;
  upserted: number | null;
  skipped: number | null;
  error: string | null;
  /** The last window this run committed (yyyy-mm-dd), null when none committed. */
  last_window_end: string | null;
  last_activity_at: string;
  /** The interrupted run this one resumed, when it is a resume. */
  resumed_from_run_id: string | null;
};

/** The latest backfill run of a company, with `interrupted` derived for a run whose worker is gone. */
export async function readLatestBackfillRun(
  client: DbClient,
  operatingCompanyId: string,
  staleMinutes = BACKFILL_STALE_MINUTES
): Promise<BackfillRunState | null> {
  const res = await client.query<Omit<BackfillRunState, "status"> & { terminal: string | null; stale: boolean }>(
    `WITH latest_start AS (
       SELECT payload ->> 'run_id' AS run_id,
              COALESCE((payload ->> 'months')::int, 24) AS months,
              payload ->> 'resumed_from_run_id' AS resumed_from_run_id,
              created_at
         FROM audit.audit_events
        WHERE source = $2
          AND event_class = 'integrations.relay_fuel_ingest_backfill_started'
          AND payload ->> 'operating_company_id' = $1
        ORDER BY created_at DESC
        LIMIT 1
     ), terminal AS (
       SELECT e.event_class, e.payload, e.created_at
         FROM audit.audit_events e
         JOIN latest_start s ON e.payload ->> 'run_id' = s.run_id
        WHERE e.source = $2
          AND e.event_class IN ('integrations.relay_fuel_ingest_backfill_completed',
                                'integrations.relay_fuel_ingest_backfill_failed',
                                'integrations.relay_fuel_ingest_backfill_interrupted')
        ORDER BY e.created_at DESC
        LIMIT 1
     ), beat AS (
       SELECT max(e.created_at) AS last_beat, max(e.payload ->> 'window_end') AS last_window_end
         FROM audit.audit_events e
         JOIN latest_start s ON e.payload ->> 'run_id' = s.run_id
        WHERE e.source = $2 AND e.event_class = 'integrations.relay_fuel_ingest_backfill_window'
     )
     SELECT s.run_id, s.months, s.resumed_from_run_id,
            s.created_at::text AS started_at,
            t.created_at::text AS completed_at,
            NULLIF(t.payload ->> 'pulled', '')::int AS pulled,
            NULLIF(t.payload ->> 'upserted', '')::int AS upserted,
            NULLIF(t.payload ->> 'skipped', '')::int AS skipped,
            t.payload ->> 'error' AS error,
            t.event_class AS terminal,
            COALESCE(t.payload ->> 'last_window_end', b.last_window_end) AS last_window_end,
            GREATEST(s.created_at, COALESCE(b.last_beat, s.created_at))::text AS last_activity_at,
            (GREATEST(s.created_at, COALESCE(b.last_beat, s.created_at)) < now() - make_interval(mins => $3::int)) AS stale
       FROM latest_start s
       CROSS JOIN beat b
       LEFT JOIN terminal t ON true`,
    [operatingCompanyId, RELAY_BACKFILL_AUDIT_SOURCE, staleMinutes]
  );
  const r = res.rows[0];
  if (!r) return null;
  const status: BackfillRunState["status"] = r.terminal?.endsWith("_completed")
    ? "completed"
    : r.terminal?.endsWith("_failed")
      ? "failed"
      : r.terminal?.endsWith("_interrupted") || r.stale
        ? "interrupted"
        : "running";
  const { terminal: _t, stale: _s, ...rest } = r;
  return { ...rest, status };
}

/** Durably close a run whose worker is gone (idempotent: an already-terminal run is left as is). */
export async function closeInterruptedBackfillRun(client: DbClient, run: BackfillRunState, operatingCompanyId: string): Promise<boolean> {
  if (run.status !== "interrupted" || run.completed_at) return false;
  await client.query(`SELECT audit.append_event($1, 'warning', $2::jsonb, NULL, $3)`, [
    "integrations.relay_fuel_ingest_backfill_interrupted",
    JSON.stringify({
      run_id: run.run_id,
      operating_company_id: operatingCompanyId,
      months: run.months,
      last_window_end: run.last_window_end,
      last_activity_at: run.last_activity_at,
      reason: `no heartbeat for ${BACKFILL_STALE_MINUTES} minutes — the worker is gone (deploy / restart)`,
    }),
    RELAY_BACKFILL_AUDIT_SOURCE,
  ]);
  return true;
}

/** The heartbeat: one row per committed window of a run. */
export async function recordBackfillWindow(
  client: DbClient,
  input: { run_id: string; operating_company_id: string; window_start: string; window_end: string; instance: string; pulled: number; upserted: number }
): Promise<void> {
  await client.query(`SELECT audit.append_event($1, 'info', $2::jsonb, NULL, $3)`, [
    "integrations.relay_fuel_ingest_backfill_window",
    JSON.stringify(input),
    RELAY_BACKFILL_AUDIT_SOURCE,
  ]);
}

/** yyyy-mm-dd + 1 day. */
export function nextIsoDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
