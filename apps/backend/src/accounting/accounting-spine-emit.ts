import { randomUUID } from "crypto";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type AccountingSpineEvent =
  | "invoice.created"
  | "invoice.updated"
  | "invoice.sent"
  | "invoice.voided"
  | "bill.created"
  | "bill.paid"
  | "bill.voided"
  | "bill_payment.voided"
  | "bill.allocated"
  | "expense.created"
  | "expense.reattributed"
  | "payment.created"
  | "payment.voided"
  | "customer_payment.created";

export async function emitAccountingSpineEvent(
  client: DbClient,
  opts: {
    operating_company_id: string;
    actor_user_id: string;
    event_type: AccountingSpineEvent;
    entity_id: string;
    entity_type: string;
    source_table: string;
    correlation_id?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const correlationId = opts.correlation_id ?? randomUUID();
  await client.query(
    `SELECT events.log_event(
      $1, $2, 'user', $3, $4, $5, $6, now(), 'accounting',
      $7, $5::uuid, $8::uuid, $9::uuid
    )`,
    [
      opts.operating_company_id,
      opts.event_type,
      opts.actor_user_id,
      opts.entity_type,
      opts.entity_id,
      JSON.stringify(opts.payload ?? {}),
      opts.source_table,
      opts.actor_user_id,
      correlationId,
    ]
  );
}
