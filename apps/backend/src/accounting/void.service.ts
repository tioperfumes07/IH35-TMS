// VOID-EVERYWHERE PR-1 — shared void engine (gated behind VOID_ENFORCEMENT_ENABLED, default OFF).
//
// When the flag is ON, voiding an invoice or journal entry posts an equal-and-opposite REVERSING
// journal entry and marks the original VOIDED (with reason + actor + audit). The reversing entry is
// dated per the QuickBooks-grounded rule:
//   - original txn's accounting period OPEN  -> reverse at the original date.
//   - original period CLOSED                 -> reverse in the CURRENT open period (never rewrite a
//                                               closed period; respects the closed-period write-lock).
// VOID = Owner + Accountant only. DELETE = Owner only.
//
// The reversal + the status flip run on the SAME transaction client passed in by the caller, so they
// are atomic. This module does not open its own transaction and does not modify the posting engine.

import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const VOID_FLAG_KEY = "VOID_ENFORCEMENT_ENABLED";

export type VoidableEntityType = "invoice" | "journal_entry" | "bill";

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type GlPostingRow = {
  account_id: string;
  class_id: string | null;
  entity_uuid: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  line_sequence: number;
};

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested) — this is the logic GUARD verifies vs QuickBooks.
// ---------------------------------------------------------------------------

/** VOID = Owner + Accountant only (Administrator excluded, per Jorge 2026-06-14). */
export function canVoid(role: string | null | undefined): boolean {
  return role === "Owner" || role === "Accountant";
}

/** DELETE = Owner only. */
export function canDelete(role: string | null | undefined): boolean {
  return role === "Owner";
}

/**
 * Grounded reversal-date rule. `closedThrough` is accounting.closed_period_cutoff (MAX closed period_end),
 * or null if nothing is closed. All dates are ISO `YYYY-MM-DD` strings (lexical compare == date compare).
 *   - original period open (originalDate > closedThrough, or nothing closed) -> reverse at originalDate.
 *   - original period closed (originalDate <= closedThrough)                 -> reverse at currentDate.
 */
export function resolveReversalDate(
  originalDate: string,
  closedThrough: string | null,
  currentDate: string
): string {
  if (closedThrough && originalDate <= closedThrough) return currentDate;
  return originalDate;
}

/** True when the reversal lands in a different (current) period than the original — i.e. closed-period void. */
export function isClosedPeriodReversal(originalDate: string, reversalDate: string): boolean {
  return reversalDate !== originalDate;
}

/** Flip every posting to the opposite side, preserving account/class/entity/amount. Balanced original -> balanced reversal. */
export function flipPostingsForReversal(rows: GlPostingRow[]): Array<Omit<GlPostingRow, "line_sequence">> {
  return rows.map((row) => ({
    account_id: row.account_id,
    class_id: row.class_id,
    entity_uuid: row.entity_uuid,
    debit_or_credit: row.debit_or_credit === "debit" ? "credit" : "debit",
    amount_cents: row.amount_cents,
    description: row.description ? `Void reversal: ${row.description}` : "Void reversal",
  }));
}

/** Balance-or-fail: total debits must equal total credits and be > 0. Mirrors createJournalEntry's guard. */
export function assertBalanced(rows: Array<{ debit_or_credit: "debit" | "credit"; amount_cents: number }>): void {
  const debits = rows.filter((r) => r.debit_or_credit === "debit").reduce((s, r) => s + Number(r.amount_cents || 0), 0);
  const credits = rows.filter((r) => r.debit_or_credit === "credit").reduce((s, r) => s + Number(r.amount_cents || 0), 0);
  if (debits <= 0 || credits <= 0) throw new Error("void_reversal_requires_debit_and_credit");
  if (debits !== credits) throw new Error("void_reversal_not_balanced");
}

/** Today's date as ISO YYYY-MM-DD (the "current open period" anchor for closed-period reversals). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// DB orchestration (runs on the caller's transaction client -> atomic).
// ---------------------------------------------------------------------------

/** Is the void engine enabled for this company/user? */
export async function isVoidEnforcementEnabled(
  client: QueryableClient,
  operatingCompanyId: string,
  userUuid: string
): Promise<boolean> {
  return isEnabled(client, VOID_FLAG_KEY, {
    operating_company_id: operatingCompanyId,
    user_uuid: userUuid,
  });
}

async function closedPeriodCutoff(client: QueryableClient, operatingCompanyId: string): Promise<string | null> {
  const res = await client.query<{ cutoff: string | null }>(
    `SELECT accounting.closed_period_cutoff($1::uuid)::text AS cutoff`,
    [operatingCompanyId]
  );
  return res.rows[0]?.cutoff ?? null;
}

/** Read the original posted GL lines for the entity being voided. */
async function readOriginalGlPostings(
  client: QueryableClient,
  operatingCompanyId: string,
  entityType: VoidableEntityType,
  entityId: string
): Promise<GlPostingRow[]> {
  if (entityType === "journal_entry") {
    const res = await client.query<GlPostingRow>(
      `
        SELECT account_id::text, class_id::text, entity_uuid::text,
               debit_or_credit, amount_cents::bigint AS amount_cents, description, line_sequence
        FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND journal_entry_uuid = $2::uuid
        ORDER BY line_sequence ASC
      `,
      [operatingCompanyId, entityId]
    );
    return res.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  }
  // invoice / bill: GL lines posted by the posting engine carry the source linkage on
  // journal_entry_postings (source_transaction_type matches the posting-engine source type).
  const res = await client.query<GlPostingRow>(
    `
      SELECT account_id::text, class_id::text, entity_uuid::text,
             debit_or_credit, amount_cents::bigint AS amount_cents, description, line_sequence
      FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid
        AND source_transaction_type = $3
        AND source_transaction_id = $2
        AND posting_batch_id IS NOT NULL
      ORDER BY line_sequence ASC
    `,
    [operatingCompanyId, entityId, entityType]
  );
  return res.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
}

export type VoidReversalResult = {
  reversal_journal_entry_id: string | null;
  reversal_date: string | null;
  closed_period_reversal: boolean;
  reversed_line_count: number;
};

/**
 * Post the reversing journal entry for a void on the SAME client (atomic with the caller's status flip).
 * Returns null reversal id when the entity had no posted GL lines (e.g. a draft invoice) — nothing to reverse.
 * A balanced standalone JE (source='auto', no source linkage) is inserted; the closed-period DB trigger is the
 * final safety net (reversalDate is always computed into an open period).
 */
export async function postVoidReversal(
  client: QueryableClient,
  params: {
    operatingCompanyId: string;
    entityType: VoidableEntityType;
    entityId: string;
    originalDate: string;
    memo: string;
    currentDate?: string;
  },
  actor: { userId: string }
): Promise<VoidReversalResult> {
  const originalLines = await readOriginalGlPostings(client, params.operatingCompanyId, params.entityType, params.entityId);
  if (originalLines.length === 0) {
    return { reversal_journal_entry_id: null, reversal_date: null, closed_period_reversal: false, reversed_line_count: 0 };
  }

  const cutoff = await closedPeriodCutoff(client, params.operatingCompanyId);
  const currentDate = params.currentDate ?? todayIso();
  const reversalDate = resolveReversalDate(params.originalDate, cutoff, currentDate);
  const closedPeriod = isClosedPeriodReversal(params.originalDate, reversalDate);

  const reversalLines = flipPostingsForReversal(originalLines);
  assertBalanced(reversalLines);

  const header = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.journal_entries
        (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending)
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true)
      RETURNING id::text
    `,
    [params.operatingCompanyId, reversalDate, params.memo, actor.userId]
  );
  const reversalJeId = header.rows[0]!.id;

  let seq = 1;
  for (const line of reversalLines) {
    await client.query(
      `
        INSERT INTO accounting.journal_entry_postings
          (operating_company_id, journal_entry_uuid, line_sequence, account_id, class_id, entity_uuid, debit_or_credit, amount_cents, description)
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8::bigint, $9)
      `,
      [
        params.operatingCompanyId,
        reversalJeId,
        seq++,
        line.account_id,
        line.class_id,
        line.entity_uuid,
        line.debit_or_credit,
        line.amount_cents,
        line.description,
      ]
    );
  }

  return {
    reversal_journal_entry_id: reversalJeId,
    reversal_date: reversalDate,
    closed_period_reversal: closedPeriod,
    reversed_line_count: reversalLines.length,
  };
}

/** Emit the audit-spine row for a void (reason + actor + reversal linkage). */
export async function auditVoid(
  client: QueryableClient,
  actorUserId: string,
  entityType: VoidableEntityType,
  params: {
    operatingCompanyId: string;
    entityId: string;
    reason: string;
    reversal: VoidReversalResult;
  }
): Promise<void> {
  const resourceTypeByEntity: Record<VoidableEntityType, string> = {
    invoice: "accounting.invoices",
    journal_entry: "accounting.journal_entries",
    bill: "accounting.bills",
  };
  const resourceType = resourceTypeByEntity[entityType];
  await appendCrudAudit(
    client,
    actorUserId,
    `${resourceType}.voided`,
    {
      resource_type: resourceType,
      resource_id: params.entityId,
      operating_company_id: params.operatingCompanyId,
      void_reason: params.reason,
      reversal_journal_entry_id: params.reversal.reversal_journal_entry_id,
      reversal_date: params.reversal.reversal_date,
      closed_period_reversal: params.reversal.closed_period_reversal,
      voided_by_user_id: actorUserId,
      engine: "VOID-EVERYWHERE-PR2",
    },
    "warning",
    "VOID-EVERYWHERE-PR2"
  );
}
