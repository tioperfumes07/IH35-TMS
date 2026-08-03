/**
 * THE canonical way to enqueue an outbox event.
 *
 * WHY THIS EXISTS. There are two outbox tables and only one of them is drained. Measured on prod
 * 2026-08-03 (positive control mdata.vendors = 2,828):
 *   outbox.outbox_queue   49 rows · ALL 'PENDING' · attempts = 0 on EVERY row · oldest 2026-06-16
 *   outbox.events     31,622 rows · 31,618 delivered · 0 undelivered · last delivery minutes earlier
 * processor.ts reads `outbox.events`. Nothing in the backend issues a SELECT or an UPDATE against
 * `outbox.outbox_queue` — a dozen producers write it and nobody reads it. Because the INSERT itself
 * succeeds, every one of those producers looked healthy at the call site while nothing downstream
 * ever ran. Hand-written INSERTs are how that happened; a single helper is how it stops.
 *
 * `outbox.events` has no aggregate_type/aggregate_id columns, so the aggregate identity that
 * outbox_queue carried in dedicated columns is folded into the payload rather than dropped. Losing
 * "which load / unit / driver was this about" would make the delivered event unactionable.
 *
 * BEFORE ADDING A NEW EVENT TYPE: confirm a handler for it is registered in handlers/registry.ts.
 * An event enqueued here with no handler does NOT sit quietly — the processor marks it failed. That
 * is the correct behaviour (loud beats silent), but it means "no handler yet" is a reason to build
 * the handler, not a reason to enqueue and hope.
 */

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type OutboxAggregate = {
  /** The table/collection the event is about, e.g. "dispatch.loads". Carried for traceability only. */
  aggregate_type: string;
  /** The row the event is about. Null only when the event genuinely has no single subject. */
  aggregate_id: string | null;
};

/**
 * Enqueue `eventType` on the canonical outbox with `payload`, folding the aggregate identity in.
 *
 * `next_retry_at` is set to now() so the processor picks the event up on its next pass — matching
 * every existing outbox.events writer in the tree.
 */
export async function enqueueOutboxEvent(
  client: Queryable,
  eventType: string,
  aggregate: OutboxAggregate,
  payload: Record<string, unknown>
): Promise<void> {
  await client.query(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at)
      VALUES ($1, $2::jsonb, now())
    `,
    [
      eventType,
      JSON.stringify({
        aggregate_type: aggregate.aggregate_type,
        aggregate_id: aggregate.aggregate_id,
        ...payload,
      }),
    ]
  );
}
