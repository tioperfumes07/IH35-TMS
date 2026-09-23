/**
 * R-102.1-A BUILD 2 — stampDocumentVoided(): the ONE writer of the void-stamp columns
 * (voided_at, void_reason, voided_by_user_id) across the seven document families named in the
 * owner's standing ruling ("FOR FUTURE REFERENCE YES AL SHOULD STATE VOIDED" -- a soft delete is
 * not a void, archived_at is not a void, status<>'voided' alone carries no actor and no reason).
 *
 * CONTRACT (same shape as reverseJournalEntryNoFlip, R-98.1-B, journal-entries.service.ts):
 * runs on the CALLER's transaction client -- the caller owns BEGIN/COMMIT/ROLLBACK, this function
 * never opens or closes a transaction of its own.
 *
 * THIS IS METADATA ONLY. NO GL MATH. NO POSTING. NO REVERSAL. It calls none of the six existing
 * reversal/void engines (void.service.ts, bulk-void.service.ts, governance/void-cancel-executors.ts,
 * settlement-posting.service.ts, amortization-posting.service.ts, loan-payment-posting.service.ts,
 * plus the inline void UPDATEs in invoices.routes.ts / expenses.routes.ts / bills.service.ts /
 * payments.routes.ts / credit-memos.routes.ts / vendor-credits.routes.ts / prepaid-expenses.routes.ts)
 * and it is not a seventh -- those keep doing their own GL-aware reversal work through their own
 * paths; this function is additive and does not replace them.
 *
 * The table for each family is a FIXED literal in FAMILY_TABLE below -- never a dynamic name built
 * from caller input. A family not in VOID_DOCUMENT_FAMILIES throws before any query runs.
 *
 * journal_entry EXCEPTION (safety-critical, do not remove): accounting.journal_entries.status is
 * NEVER flipped to 'voided' here, even though the column exists and is plain text (not an enum).
 * reverseJournalEntryNoFlip's own header (journal-entries.service.ts:470-471) documents that GL
 * total readers exclude status='voided' at 13 sites -- flipping status on a posted JE would
 * SILENTLY DROP its GL totals. stampDocumentVoided() writes the three void-stamp columns on
 * journal_entries (so an audit trail exists) but leaves status untouched for every family in
 * JOURNAL_ENTRY_LIKE_FAMILIES. This is a deliberate, documented exception to the ruling's generic
 * "status='voided' where a status column exists" -- the alternative (silently corrupting live GL
 * totals) is unacceptable and the ruling itself forbids GL math / reversal logic in this function.
 */

export type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const VOID_DOCUMENT_FAMILIES = [
  "load",
  "invoice",
  "expense",
  "factoring_advance",
  "fuel_transaction",
  "journal_entry",
  "driver_reimbursement",
] as const;

export type VoidDocumentFamily = (typeof VOID_DOCUMENT_FAMILIES)[number];

type FamilyTableSpec = {
  schema: string;
  table: string;
  hasStatusColumn: boolean;
  /** true only for journal_entry -- see the journal_entry EXCEPTION in the file header. */
  neverFlipStatus?: boolean;
};

/** FIXED literal table map -- never build a table name from caller input (ruling requirement). */
const FAMILY_TABLE: Record<VoidDocumentFamily, FamilyTableSpec> = {
  load: { schema: "mdata", table: "loads", hasStatusColumn: true },
  invoice: { schema: "accounting", table: "invoices", hasStatusColumn: true },
  expense: { schema: "accounting", table: "expenses", hasStatusColumn: true },
  factoring_advance: { schema: "accounting", table: "factoring_advances", hasStatusColumn: true },
  fuel_transaction: { schema: "fuel", table: "fuel_transactions", hasStatusColumn: false },
  journal_entry: { schema: "accounting", table: "journal_entries", hasStatusColumn: true, neverFlipStatus: true },
  driver_reimbursement: { schema: "driver_finance", table: "driver_reimbursements", hasStatusColumn: true },
};

export class VoidDocumentStampError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "VoidDocumentStampError";
  }
}

export type StampDocumentVoidedParams = {
  operatingCompanyId: string;
  family: VoidDocumentFamily;
  documentId: string;
  voidReason: string;
  voidedByUserId: string;
  voidedAt?: Date | string;
};

export type StampDocumentVoidedResult = {
  already_voided: boolean;
  family: VoidDocumentFamily;
  document_id: string;
  voided_at: string;
  void_reason: string;
  voided_by_user_id: string;
  status_flip_applied: boolean;
};

/**
 * Stamp a document voided: voided_at, void_reason, voided_by_user_id, and status='voided' where a
 * status column exists (journal_entry excepted -- see file header). Runs on the caller's
 * transaction client. Refuses loudly (VoidDocumentStampError, never a silent no-op) on:
 *   - family not in VOID_DOCUMENT_FAMILIES
 *   - void_reason empty or whitespace-only
 *   - voided_by_user_id null/empty, or not a real identity.users row
 *   - document not found for (family, documentId)
 *   - document's operating_company_id !== operatingCompanyId passed in
 *   - document already voided with a DIFFERENT void_reason or a different voided_by_user_id
 * Idempotent on an IDENTICAL (document, void_reason, voided_by_user_id): a second call returns
 * already_voided: true instead of throwing or re-writing voided_at.
 */
export async function stampDocumentVoided(
  client: QueryableClient,
  params: StampDocumentVoidedParams
): Promise<StampDocumentVoidedResult> {
  const { operatingCompanyId, family, documentId } = params;
  const voidReason = params.voidReason?.trim() ?? "";
  const voidedByUserId = params.voidedByUserId?.trim() ?? "";

  const spec = FAMILY_TABLE[family];
  if (!spec) {
    throw new VoidDocumentStampError(
      "invalid_void_family",
      `stampDocumentVoided: "${family}" is not a recognized document family (expected one of ${VOID_DOCUMENT_FAMILIES.join(", ")}).`
    );
  }
  if (!voidReason) {
    throw new VoidDocumentStampError("void_reason_required", "stampDocumentVoided: void_reason is empty or whitespace-only.");
  }
  if (!voidedByUserId) {
    throw new VoidDocumentStampError("voided_by_user_id_required", "stampDocumentVoided: voided_by_user_id is null or empty.");
  }
  if (!documentId?.trim()) {
    throw new VoidDocumentStampError("document_id_required", "stampDocumentVoided: documentId is empty.");
  }
  if (!operatingCompanyId?.trim()) {
    throw new VoidDocumentStampError("operating_company_id_required", "stampDocumentVoided: operatingCompanyId is empty.");
  }

  const actorRes = await client.query<{ id: string }>(`SELECT id::text FROM identity.users WHERE id = $1::uuid LIMIT 1`, [voidedByUserId]);
  if (!actorRes.rows[0]) {
    throw new VoidDocumentStampError(
      "voided_by_user_id_not_found",
      `stampDocumentVoided: voided_by_user_id ${voidedByUserId} is not a real identity.users row.`
    );
  }

  const qualifiedTable = `${spec.schema}.${spec.table}`;
  const existingRes = await client.query<{
    id: string;
    operating_company_id: string;
    voided_at: string | null;
    void_reason: string | null;
    voided_by_user_id: string | null;
  }>(
    `SELECT id::text, operating_company_id::text, voided_at::text, void_reason, voided_by_user_id::text
       FROM ${qualifiedTable}
      WHERE id = $1::uuid
      LIMIT 1
      FOR UPDATE`,
    [documentId]
  );
  const existing = existingRes.rows[0];
  if (!existing) {
    throw new VoidDocumentStampError("document_not_found", `stampDocumentVoided: no ${family} document ${documentId} found.`);
  }
  if (existing.operating_company_id !== operatingCompanyId) {
    throw new VoidDocumentStampError(
      "document_company_mismatch",
      `stampDocumentVoided: document ${documentId}'s operating_company_id (${existing.operating_company_id}) does not match the company passed in (${operatingCompanyId}).`
    );
  }

  if (existing.voided_at) {
    const sameReason = (existing.void_reason ?? "").trim() === voidReason;
    const sameActor = existing.voided_by_user_id === voidedByUserId;
    if (sameReason && sameActor) {
      return {
        already_voided: true,
        family,
        document_id: documentId,
        voided_at: existing.voided_at,
        void_reason: existing.void_reason ?? "",
        voided_by_user_id: existing.voided_by_user_id ?? "",
        status_flip_applied: false,
      };
    }
    throw new VoidDocumentStampError(
      "already_voided_different_reason",
      `stampDocumentVoided: document ${documentId} (${family}) is already voided (reason="${existing.void_reason}", actor=${existing.voided_by_user_id}); refusing to overwrite with a different reason/actor (reason="${voidReason}", actor=${voidedByUserId}).`
    );
  }

  const applyStatusFlip = spec.hasStatusColumn && !spec.neverFlipStatus;
  const voidedAtParam = params.voidedAt ?? new Date();
  const setClauses = ["voided_at = $2", "void_reason = $3", "voided_by_user_id = $4::uuid"];
  if (applyStatusFlip) setClauses.push("status = 'voided'");

  const updateRes = await client.query<{ voided_at: string }>(
    `UPDATE ${qualifiedTable}
        SET ${setClauses.join(", ")}
      WHERE id = $1::uuid AND operating_company_id = $5::uuid
      RETURNING voided_at::text`,
    [documentId, voidedAtParam, voidReason, voidedByUserId, operatingCompanyId]
  );
  const written = updateRes.rows[0];
  if (!written) {
    throw new VoidDocumentStampError(
      "document_write_race_lost",
      `stampDocumentVoided: UPDATE on ${qualifiedTable} for document ${documentId} matched no row (race with a concurrent write).`
    );
  }

  return {
    already_voided: false,
    family,
    document_id: documentId,
    voided_at: written.voided_at,
    void_reason: voidReason,
    voided_by_user_id: voidedByUserId,
    status_flip_applied: applyStatusFlip,
  };
}
