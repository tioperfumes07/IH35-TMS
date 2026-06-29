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
  | "customer_payment.created"
  // CODER-12 audit-spine: events for the 5 posters that previously emitted no spine.
  | "journal_entry.created"
  | "journal_entry.reversed"
  | "recurring.posted"
  | "period_close.posted"
  | "bank_reconciliation.variance_posted";

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

/**
 * CODER-12 audit-spine: write ONE accounting.transaction_source_links row tying a posting line back
 * to its source object. Mirrors posting-engine's inline insert (grain = per posting line). Idempotent
 * via uq_tsl_posting_object_role (ON CONFLICT DO NOTHING) so a re-run never duplicates a link.
 * MUST be called on the SAME client/transaction as the GL posting (atomic, fail-loud).
 */
export async function writeTransactionSourceLink(
  client: DbClient,
  opts: {
    operating_company_id: string;
    journal_entry_posting_id: string;
    linked_object_type: string;
    linked_object_id: string; // TEXT NOT NULL — cast uuids to text at the call site
    relationship_role?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO accounting.transaction_source_links
       (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role, created_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, now())
     ON CONFLICT (journal_entry_posting_id, linked_object_type, linked_object_id, COALESCE(relationship_role, ''))
     DO NOTHING`,
    [
      opts.operating_company_id,
      opts.journal_entry_posting_id,
      opts.linked_object_type,
      opts.linked_object_id,
      opts.relationship_role ?? null,
    ]
  );
}
