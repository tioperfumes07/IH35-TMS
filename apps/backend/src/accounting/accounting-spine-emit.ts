import { randomUUID } from "crypto";
import { logger } from "../observability/structured-logger.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

// events.event_log's `valid_subject_type` CHECK allowlist (db/migrations/202606111050_w1a_event_log_spine.sql).
const VALID_SUBJECT_TYPES = new Set([
  "load", "driver", "unit", "geofence", "document", "assignment", "status", "broker", "task", "alert",
]);

export type AccountingSpineEvent =
  | "invoice.created"
  | "invoice.updated"
  | "invoice.sent"
  | "invoice.voided"
  | "bill.created"
  | "bill.paid"
  | "bill.voided"
  // BUG FIX (audit-spine-emit-silent-failures, found alongside the 3 tracked defects): the noun half
  // of events.event_log's valid_event_type CHECK (letters-only, no underscore, exactly one dot before
  // the action) was previously violated here: the old bill-payment-voided / customer-payment-created
  // event types both had an underscore BEFORE the dot, so every emit unconditionally violated the
  // CHECK — same root cause as the banking fix in this PR. Renamed to keep the underscore only in the
  // action half (after the dot).
  | "payment.bill_voided"
  | "bill.allocated"
  | "expense.created"
  | "expense.reattributed"
  | "payment.created"
  | "payment.voided"
  | "payment.customer_created"
  // FIN-18 (appended additively): driver settlement + bucketed-deduction GL posting events.
  // subject_type='driver' is within the events.event_log allowlist (verified live).
  | "settlement.posted"
  | "settlement.reversed"
  // FIN-21 (appended additively): prepaid-amortization + fixed-asset-depreciation GL posting.
  // Emitted only for unit-linked assets (subject_type='unit' is allowlisted by event_log).
  | "amortization.posted"
  // FIN-22 (appended additively): lessor lease ASC 842 GL posting event. One event type for the block.
  | "lease.posted";

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
  // BUG FIX (invalid subject_type, found while root-causing the 3 tracked audit-spine-emit-silent-failures
  // defects and PROVING each fix against a real local DB): `entity_type` was bound directly to
  // p_subject_type, but call sites pass free-form values ("invoice", "bill", "bill_payment", "expense",
  // "payment", "customer_payment") that are NOT members of events.event_log's valid_subject_type
  // allowlist — those emits would still have failed even after the event_type rename above. ("driver" /
  // "unit", used by the FIN-18/FIN-21/FIN-22 blocks, ARE allowlisted, per the comments already on those
  // union members — left untouched.) Fix: use entity_type as subject_type only when it's a valid member,
  // otherwise fall back to 'task' (the same allowed bucket maintenance-spine-emit.ts /
  // driver-request-spine-emit.ts already use for process/action-lifecycle events with no bespoke
  // subject_type). entity_type itself is never dropped — it's carried in payload.entity_type either way.
  const subjectType = VALID_SUBJECT_TYPES.has(opts.entity_type) ? opts.entity_type : "task";
  try {
    // DISTINCT placeholders for entity_id used as text (subject_id $5) vs ::uuid (source_reference_id $8):
    // reusing one $n as BOTH text and ::uuid makes Postgres fail "inconsistent types deduced for parameter".
    await client.query(
      `SELECT events.log_event(
        $1, $2, 'user', $3, $4, $5, $6, now(), 'accounting',
        $7, $8::uuid, $9::uuid, $10::uuid
      )`,
      [
        opts.operating_company_id,
        opts.event_type,
        opts.actor_user_id,
        subjectType,
        opts.entity_id,
        JSON.stringify({ entity_type: opts.entity_type, ...(opts.payload ?? {}) }),
        opts.source_table,
        opts.entity_id,
        opts.actor_user_id,
        correlationId,
      ]
    );
  } catch (err) {
    // Non-silent by construction — see banking-spine-emit.ts for the same rationale: log at the true
    // source of failure regardless of caller-side error handling; log-then-rethrow keeps this
    // non-blocking for fire-and-forget callers while preserving fail-loud semantics for any awaited caller
    // (e.g. the in-transaction settlement/amortization/lease posting services).
    logger.error("spine_emit_accounting_failed", err, {
      event_type: opts.event_type,
      entity_type: opts.entity_type,
      entity_id: opts.entity_id,
      company_id: opts.operating_company_id,
      correlation_id: correlationId,
    });
    throw err;
  }
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
