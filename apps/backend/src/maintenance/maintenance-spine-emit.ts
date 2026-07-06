import { randomUUID } from "crypto";
import { logger } from "../observability/structured-logger.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type MaintenanceSpineEvent =
  | "wo.created"
  | "wo.status_changed"
  | "wo.completed"
  | "wo.line_item_added"
  | "wo.line_item_removed";

export async function emitMaintenanceSpineEvent(
  client: DbClient,
  opts: {
    operating_company_id: string;
    actor_user_id: string;
    event_type: MaintenanceSpineEvent;
    work_order_id: string;
    correlation_id?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const correlationId = opts.correlation_id ?? randomUUID();
  try {
    // BUG FIX (invalid subject_type): events.event_log's `valid_subject_type` CHECK only allows
    // ('load'|'driver'|'unit'|'geofence'|'document'|'assignment'|'status'|'broker'|'task'|'alert') —
    // the hardcoded literal 'work_order' below was NOT a member, so every emit from this file
    // unconditionally violated the CHECK and was rejected. A maintenance work order is an
    // action-item lifecycle (created -> status changes -> completed), the same shape
    // driver-request-spine-emit.ts already models under subject_type 'task' — reusing that allowed
    // value here (work_order_id stays the subject_id; the WO/task distinction is carried by
    // event_type + source_table, exactly as driver-request-spine-emit.ts does for its own 'task' rows).
    //
    // BUG FIX (placeholder-cast collision): $4 (work_order_id) was previously reused BOTH bare (as
    // the text p_subject_id argument) AND as `$4::uuid` (as the p_source_reference_id argument) in
    // the same query — Postgres requires one parameter number to resolve to one consistent type
    // across all its appearances, so binding it once untyped and once cast to uuid fails every call
    // with "inconsistent types deduced for parameter $4". Fix: bind work_order_id twice, at two
    // DISTINCT placeholder numbers ($4 bare, $6 cast).
    await client.query(
      `SELECT events.log_event(
        $1, $2, 'user', $3, 'task', $4, $5, now(), 'maintenance',
        'maintenance.work_orders', $6::uuid, $7::uuid, $8::uuid
      )`,
      [
        opts.operating_company_id,
        opts.event_type,
        opts.actor_user_id,
        opts.work_order_id,
        JSON.stringify(opts.payload ?? {}),
        opts.work_order_id,
        opts.actor_user_id,
        correlationId,
      ]
    );
  } catch (err) {
    // Non-silent by construction — see banking-spine-emit.ts for the same rationale: log at the true
    // source of failure regardless of caller-side error handling; log-then-rethrow keeps this
    // non-blocking for fire-and-forget callers while preserving fail-loud semantics for any awaited caller.
    logger.error("spine_emit_maintenance_failed", err, {
      event_type: opts.event_type,
      work_order_id: opts.work_order_id,
      company_id: opts.operating_company_id,
      correlation_id: correlationId,
    });
    throw err;
  }
}
