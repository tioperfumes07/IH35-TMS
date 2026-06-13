import { randomUUID } from "crypto";

// B4 — driver-request accountability timeline emitted onto the existing immutable spine
// (events.event_log via events.log_event). Generic across request types via source_table /
// source_reference_id so diesel/repair/expense requests slot in later without rework.
//
// events.event_log RLS (W1A) keys on app.current_operating_company_id and events.log_event is
// SECURITY INVOKER, while driver-finance routes set app.operating_company_id. So set the
// event_log GUC explicitly (txn-local) before reading/writing the spine.

type DbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type DriverRequestStep = "requested" | "viewed" | "approved" | "denied" | "posted";
export type DriverRequestActorType = "driver" | "user" | "system";

// events.event_log valid_subject_type only allows a fixed enum (load/driver/unit/.../task/alert),
// so a pending request is recorded as subject_type 'task' (an action item awaiting office
// response). Driver-request events are isolated by event_type 'request.*' + source_table, not
// by subject_type — see views.driver_request_timeline.
const SUBJECT_TYPE = "task";

export type DriverRequestEmitOpts = {
  operating_company_id: string;
  request_id: string;
  request_type: string; // e.g. "cash_advance" (generic for future diesel/repair/expense)
  source_table: string; // e.g. "driver_finance.cash_advance_requests"
  actor_type: DriverRequestActorType;
  actor_user_id: string;
  actor_role: string | null; // Owner/Administrator/Dispatcher/Accountant/Driver
  correlation_id?: string;
  payload?: Record<string, unknown>;
};

async function setEventLogScope(client: DbClient, operatingCompanyId: string): Promise<void> {
  await client.query(`SELECT set_config('app.current_operating_company_id', $1::text, true)`, [operatingCompanyId]);
}

/** Emit one timeline step for a driver request onto events.event_log. */
export async function emitDriverRequestSpineEvent(
  client: DbClient,
  step: DriverRequestStep,
  opts: DriverRequestEmitOpts
): Promise<void> {
  await setEventLogScope(client, opts.operating_company_id);
  const correlationId = opts.correlation_id ?? randomUUID();
  // event_type must match events.event_log valid_event_type: ^[a-z]+\.[a-z_]+$ (noun before
  // the dot is letters-only). Noun is 'request'; the driver qualifier lives in subject_type
  // ('driver_request') and payload.request_type. e.g. 'request.viewed'.
  await client.query(
    `SELECT events.log_event($1, $2, $3, $4, $5, $6, $7, now(), 'driver_request', $8, $9::uuid, $10::uuid, $11::uuid)`,
    [
      opts.operating_company_id,
      `request.${step}`,
      opts.actor_type,
      opts.actor_user_id,
      SUBJECT_TYPE,
      opts.request_id,
      JSON.stringify({ request_type: opts.request_type, actor_role: opts.actor_role, ...(opts.payload ?? {}) }),
      opts.source_table,
      opts.request_id,
      opts.actor_user_id,
      correlationId,
    ]
  );
}

/**
 * Emit the 'viewed' step the FIRST time an office user opens a request — idempotent (once per
 * request, not per refresh). Returns true if it emitted, false if a prior view already exists.
 * Driver-side views must NOT call this; only office (dispatcher/manager/accountant/owner) detail reads.
 */
export async function emitDriverRequestViewedOnce(client: DbClient, opts: DriverRequestEmitOpts): Promise<boolean> {
  await setEventLogScope(client, opts.operating_company_id);
  const existing = await client.query(
    `
      SELECT 1
      FROM events.event_log
      WHERE source_table = $1
        AND source_reference_id = $2::uuid
        AND event_type = 'request.viewed'
      LIMIT 1
    `,
    [opts.source_table, opts.request_id]
  );
  if (existing.rows.length > 0) return false;
  await emitDriverRequestSpineEvent(client, "viewed", opts);
  return true;
}
