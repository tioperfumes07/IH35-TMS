import { randomUUID } from "crypto";
import { logger } from "../observability/structured-logger.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

// BUG FIX (audit-spine-emit-silent-failures): every value below previously carried a redundant
// "banking." prefix (e.g. "banking.transfer.created"), giving the string TWO dots. events.event_log's
// `valid_event_type` CHECK requires exactly one dot (`^[a-z]+\.[a-z_]+$` — letters-only noun, then a
// snake_case action). Every emit from this file therefore violated the CHECK and was rejected by
// Postgres on every call — the "banking" domain is already carried separately as p_source ('banking')
// in the events.log_event() call below, so the prefix was pure duplication. Renamed to single-dot
// noun.action form; "cc_payment"/"manual_je" (which contain an underscore BEFORE the dot, also illegal
// under the noun-is-letters-only half of the CHECK) became "ccpayment"/"manualje".
export type BankingSpineEvent =
  | "transfer.created"
  | "ccpayment.created"
  | "transfer.revoked"
  | "transaction.categorized"
  | "transaction.skipped"
  | "transaction.investigate_flagged"
  | "reconciliation.started"
  | "reconciliation.completed"
  | "manualje.created";

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
  try {
    // BUG FIX (invalid subject_type, found while proving this fix against a real local DB — masked
    // until the placeholder-cast bug below was fixed, since that error fired first, before Postgres
    // ever reached CHECK evaluation): the caller-supplied `entity_type` ("transfer" / "bank_transaction"
    // / "reconciliation_session" / "journal_entry") was bound directly to p_subject_type, but NONE of
    // those strings are members of events.event_log's `valid_subject_type` allowlist
    // (load|driver|unit|geofence|document|assignment|status|broker|task|alert) — every emit would have
    // continued to fail even after the event_type/placeholder fixes below. Banking events are all
    // process/action lifecycles (a transfer, a categorization, a reconciliation session), the same
    // shape maintenance-spine-emit.ts / driver-request-spine-emit.ts already model under the allowed
    // 'task' value — reused here for the same reason. `entity_type` is no longer dropped: it's carried
    // in payload.entity_type so the distinction between a transfer/bank_transaction/reconciliation_session
    // is still recoverable from the row.
    //
    // BUG FIX (placeholder-cast collision): $5 (entity_id) was previously reused BOTH bare (as the
    // text p_subject_id argument) AND as `$5::uuid` (as the p_source_reference_id argument) in the
    // same query. Postgres's extended query protocol requires a single parameter number to resolve to
    // one consistent type across all of its appearances; binding it once untyped and once cast to uuid
    // makes every call fail with "inconsistent types deduced for parameter $5" — unconditionally, on
    // every emit. Fix: bind entity_id twice, at two DISTINCT placeholder numbers ($5 bare, $8 cast),
    // matching the pattern already used correctly in accounting-spine-emit.ts / driver-request-spine-emit.ts.
    await client.query(
      `SELECT events.log_event(
        $1, $2, 'user', $3, 'task', $4, $5, now(), 'banking',
        $6, $7::uuid, $8::uuid, $9::uuid
      )`,
      [
        opts.operating_company_id,
        opts.event_type,
        opts.actor_user_id,
        opts.entity_id,
        JSON.stringify({ entity_type: opts.entity_type, ...(opts.payload ?? {}) }),
        opts.source_table,
        opts.entity_id,
        opts.actor_user_id,
        correlationId,
      ]
    );
  } catch (err) {
    // Non-silent by construction: this logs at the true source of failure regardless of whether the
    // caller wraps the call in its own .catch(). Audit emits must stay non-blocking, so we log and
    // rethrow rather than swallow — fire-and-forget callers (`void emitBankingSpineEvent(...).catch(...)`)
    // already treat a rejection as non-blocking; in-transaction awaited callers (if any are added later)
    // keep their existing fail-loud semantics.
    logger.error("spine_emit_banking_failed", err, {
      event_type: opts.event_type,
      entity_type: opts.entity_type,
      entity_id: opts.entity_id,
      company_id: opts.operating_company_id,
      correlation_id: correlationId,
    });
    throw err;
  }
}
