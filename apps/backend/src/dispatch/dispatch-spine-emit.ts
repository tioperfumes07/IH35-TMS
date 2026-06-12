import { randomUUID } from "crypto";

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
  await client.query(
    `SELECT events.log_event(
      $1, $2, 'user', $3, 'load', $4, $5, now(), 'dispatch',
      'mdata.loads', $4::uuid, $6::uuid, $7::uuid
    )`,
    [
      opts.operating_company_id,
      opts.event_type,
      opts.actor_user_id,
      opts.load_id,
      JSON.stringify(opts.payload ?? {}),
      opts.actor_user_id,
      correlationId,
    ]
  );
}
