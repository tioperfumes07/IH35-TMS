import { randomUUID } from "crypto";

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
  await client.query(
    `SELECT events.log_event(
      $1, $2, 'user', $3, 'work_order', $4, $5, now(), 'maintenance',
      'maintenance.work_orders', $4::uuid, $6::uuid, $7::uuid
    )`,
    [
      opts.operating_company_id,
      opts.event_type,
      opts.actor_user_id,
      opts.work_order_id,
      JSON.stringify(opts.payload ?? {}),
      opts.actor_user_id,
      correlationId,
    ]
  );
}
