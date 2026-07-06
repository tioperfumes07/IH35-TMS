import { randomUUID } from "crypto";
import { logger } from "../observability/structured-logger.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type DispatchSpineEvent =
  | "load.created"
  | "load.status_changed"
  | "load.rate_changed"
  | "load.chargeback_flagged"
  | "load.cancelled"
  | "load.cancellation_approved"
  | "load.assigned_to_driver"
  | "load.quicksave_draft_completed";

export async function emitDispatchSpineEvent(
  client: DbClient,
  opts: {
    operating_company_id: string;
    actor_user_id: string;
    event_type: DispatchSpineEvent;
    load_id: string;
    correlation_id?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const correlationId = opts.correlation_id ?? randomUUID();
  try {
    // BUG FIX (placeholder-cast collision): $4 (load_id) was previously reused BOTH bare (as the
    // text p_subject_id argument) AND as `$4::uuid` (as the p_source_reference_id argument) in the
    // same query. Postgres's extended query protocol requires a single parameter number to resolve
    // to one consistent type across all of its appearances, so binding it once untyped and once cast
    // to uuid fails every call with "inconsistent types deduced for parameter $4". Fix: bind load_id
    // twice, at two DISTINCT placeholder numbers ($4 bare, $6 cast) — matching the pattern already
    // used correctly in accounting-spine-emit.ts / driver-request-spine-emit.ts. (event_type/subject_type
    // ('load') here were already valid against events.event_log's CHECK constraints — only the
    // placeholder collision was broken.)
    await client.query(
      `SELECT events.log_event(
        $1, $2, 'user', $3, 'load', $4, $5, now(), 'dispatch',
        'mdata.loads', $6::uuid, $7::uuid, $8::uuid
      )`,
      [
        opts.operating_company_id,
        opts.event_type,
        opts.actor_user_id,
        opts.load_id,
        JSON.stringify(opts.payload ?? {}),
        opts.load_id,
        opts.actor_user_id,
        correlationId,
      ]
    );
  } catch (err) {
    // Non-silent by construction — see banking-spine-emit.ts for the same rationale: log at the true
    // source of failure regardless of caller-side error handling; log-then-rethrow keeps this
    // non-blocking for fire-and-forget callers while preserving fail-loud semantics for the
    // intentionally-awaited in-transaction callers (load.status_changed, load.chargeback_flagged).
    logger.error("spine_emit_dispatch_failed", err, {
      event_type: opts.event_type,
      load_id: opts.load_id,
      company_id: opts.operating_company_id,
      correlation_id: correlationId,
    });
    throw err;
  }
}
