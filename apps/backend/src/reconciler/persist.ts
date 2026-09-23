import type { Queryable, ReconcilerRun } from "./types.js";

export type PersistSummary = {
  operating_company_id: string;
  open_count: number;
  opened_count: number;
  resolved_count: number;
  errored_invariants: string[];
};

const UPSERT_SQL = `
  INSERT INTO reconciler.exceptions (
    operating_company_id, exception_key, invariant, entity_type, entity_id, entity_label, field,
    reason, since, since_source, owner_seat, repair_engine, amount_cents, amount_source
  ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8, $9::timestamptz, $10, $11, $12, $13, $14)
  ON CONFLICT (operating_company_id, exception_key) DO UPDATE SET
    entity_label   = EXCLUDED.entity_label,
    reason         = EXCLUDED.reason,
    since          = EXCLUDED.since,
    since_source   = EXCLUDED.since_source,
    owner_seat     = EXCLUDED.owner_seat,
    repair_engine  = EXCLUDED.repair_engine,
    amount_cents   = EXCLUDED.amount_cents,
    amount_source  = EXCLUDED.amount_source,
    last_seen_at   = now(),
    times_reopened = reconciler.exceptions.times_reopened
                     + CASE WHEN reconciler.exceptions.resolved_at IS NULL THEN 0 ELSE 1 END,
    resolved_at    = NULL
`;

/**
 * Records one reconciler run in reconciler.exceptions / reconciler.runs. Must run inside the caller's
 * transaction. An exception found again is refreshed (and reopened if it had resolved); one that an
 * invariant which RAN no longer finds is resolved. An invariant that errored resolves nothing — its open
 * rows stay open, and the run row names it.
 */
export async function persistReconcilerRun(client: Queryable, run: ReconcilerRun): Promise<PersistSummary> {
  const co = run.operating_company_id;
  const ranIds = run.results.filter((r) => r.status === "ok").map((r) => r.invariant);
  const seen = run.results.flatMap((r) => (r.status === "ok" ? r.exceptions : []));
  const seenKeys = seen.map((e) => e.key);

  const before = await client.query<{ exception_key: string }>(
    `SELECT exception_key FROM reconciler.exceptions
      WHERE operating_company_id = $1::uuid AND resolved_at IS NULL AND invariant = ANY($2::text[])`,
    [co, ranIds]
  );
  const openBefore = new Set(before.rows.map((r) => r.exception_key));

  for (const e of seen) {
    await client.query(UPSERT_SQL, [
      co, e.key, e.invariant, e.entity_type, e.entity_id, e.entity_label, e.field,
      e.reason, e.since, e.since_source, e.owner_seat, e.repair_engine,
      e.amount_cents ?? null, e.amount_source ?? null,
    ]);
  }

  const resolved = await client.query(
    `UPDATE reconciler.exceptions SET resolved_at = now()
      WHERE operating_company_id = $1::uuid AND resolved_at IS NULL
        AND invariant = ANY($2::text[]) AND NOT (exception_key = ANY($3::text[]))
      RETURNING id`,
    [co, ranIds, seenKeys]
  );

  const open = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reconciler.exceptions WHERE operating_company_id = $1::uuid AND resolved_at IS NULL`,
    [co]
  );

  const summary: PersistSummary = {
    operating_company_id: co,
    open_count: Number(open.rows[0]?.n ?? 0),
    opened_count: seenKeys.filter((k) => !openBefore.has(k)).length,
    resolved_count: resolved.rows.length,
    errored_invariants: run.errored_invariants,
  };
  await client.query(
    `INSERT INTO reconciler.runs (operating_company_id, open_count, opened_count, resolved_count, errored_invariants)
     VALUES ($1::uuid, $2, $3, $4, $5::text[])`,
    [co, summary.open_count, summary.opened_count, summary.resolved_count, summary.errored_invariants]
  );
  return summary;
}
