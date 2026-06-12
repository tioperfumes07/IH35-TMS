import { randomUUID } from "crypto";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type BankingSpineEvent =
  | "banking.transfer.created"
  | "banking.cc_payment.created"
  | "banking.transfer.revoked"
  | "banking.transaction.categorized"
  | "banking.transaction.skipped"
  | "banking.transaction.investigate_flagged"
  | "banking.reconciliation.started"
  | "banking.reconciliation.completed"
  | "banking.manual_je.created";

export async function emitBankingSpineEvent(
  client: DbClient,
  opts: {
    operating_company_id: string;
    actor_user_id: string;
    event_type: BankingSpineEvent;
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
      $1, $2, 'user', $3, $4, $5, $6, now(), 'banking',
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
