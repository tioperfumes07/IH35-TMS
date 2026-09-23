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

// ROUND 138 (owner order, P0) — the ONE cascade void engine. Voiding a parent document must also
// cascade to that document's OWN line/detail children (invoice -> invoice_lines, bill ->
// bill_lines, etc.) -- not a seventh GL engine, pure metadata, same contract as this file's own.
// Wiring it HERE means every existing caller of stampDocumentVoided (dispatch/cancellation
// .service.ts, the governance executors, the E10 runner) gets the cascade automatically, with no
// per-caller change needed, for every family that has a CASCADE_CHILDREN entry.
import { cascadeVoidChildren, type CascadeParentFamily } from "./cascade-void-engine.service.js";
const CASCADE_ELIGIBLE_FAMILIES: ReadonlySet<string> = new Set<CascadeParentFamily>(["invoice", "expense", "factoring_advance"]);

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
  /**
   * ROUND 122 FIX (P0, real bug, not theoretical -- production measured, 2026-09-23 15:25Z):
   * the exact value THIS family's own status column accepts for "voided", read from its live
   * CHECK constraint / enum -- never assumed, never a single hardcoded literal shared across
   * families. `null` means status is never flipped for this family, either because there is no
   * status column at all (fuel_transaction) or because flipping it would break something else
   * (journal_entry -- see the journal_entry EXCEPTION in the file header, unchanged by this fix).
   *
   * The original code wrote the literal string 'voided' for every family with a status column,
   * on the unverified assumption the value was the same everywhere. It is not. Confirmed live,
   * pg_get_constraintdef on every family's own CHECK / the enum's own members, same session:
   *   invoice              accounting.invoices_status_check   -> 'void'   (NOT 'voided')
   *   expense              accounting.expenses_status_check   -> 'void'   (NOT 'voided')
   *   driver_reimbursement driver_reimbursements_status_check -> 'void'   (NOT 'voided' --
   *                        found during THIS fix, not named in the original bug report, but the
   *                        identical class of defect: same wrong hardcoded literal, same throw)
   *   factoring_advance    factoring_advances_status_check    -> 'voided' (matches the original code)
   *   load                 mdata.load_status_enum             -> 'voided' (matches the original code)
   *   journal_entry        journal_entries_status_check ALLOWS 'voided', but status is never
   *                        flipped for this family regardless -- the journal_entry EXCEPTION
   *                        above is about GL-total-reader correctness, not about the constraint.
   *   fuel_transaction     no status column exists at all -- unaffected either way.
   * Every stamp on invoices/expenses/driver_reimbursements was a CHECK-constraint violation and
   * threw before this fix -- the write never happened, so there is no bad data to clean up, only
   * a code fix.
   */
  voidStatusValue: string | null;
  /**
   * ROUND 131.2 FIX (Lead, root cause not a patch): the purge-window gate does not read
   * voided_at/status at all -- it reads scripts/purge/usmca-purge-expected-zero.generated.json's
   * OWN per-table `live_predicate`, machine-generated by scripts/purge/emit.py "the same run that
   * emitted the SQL, so the two cannot drift." This function was writing voided_at/status and
   * NOTHING else for every family, on the unverified assumption that was always the same column the
   * gate reads. It is not, for two of the seven: `fuel.fuel_transactions` -> `archived_at IS NULL`
   * (this function never wrote archived_at anywhere -- confirmed live, 2026-09-23: 227 of 227
   * voided-but-not-archived USMCA fuel_transactions, zero overlap) and `mdata.loads` ->
   * `soft_deleted_at IS NULL` (this function never wrote it either -- the E10 runner's own Phase 7
   * patched around the gap with a SEPARATE UPDATE, but any OTHER caller of stampDocumentVoided for
   * `load` would silently miss it; confirmed live, 62 of 106 status='voided' USMCA loads had no
   * soft_deleted_at before this fix). `null` here means the JSON's live_predicate is either already
   * satisfied by voided_at/status (invoice, expense, factoring_advance -- their predicates ARE
   * voided_at IS NULL / status<>'voided', the exact columns already written, so no THIRD column is
   * needed), owned partly by a DIFFERENT writer (journal_entry's compound predicate also requires
   * reversed_by_je_id/reverses_je_id, which are the reversal engines' own linkage columns, not this
   * function's job), or declared by the JSON itself to have no dedicated liveness column at all
   * (driver_reimbursement's live_predicate is JSON `null`, per the file's own `_live_predicate_law`:
   * "live_predicate = null means the table carries NO void flag at all... liveness is answered by
   * its parent document"). Values here are literal, not read from the JSON at runtime (a Node
   * service importing a repo-root-relative file outside apps/backend's own deploy tree is a real
   * operational risk for a hot financial write path) -- verified against the live JSON at the time
   * this was written, and scripts/verify-void-stamps-the-spec-liveness-column.mjs independently
   * re-reads the JSON on every push and fails loud the moment these literals and the JSON disagree,
   * the same defensive shape as FamilyTableSpec.voidStatusValue's own guard (verify-void-stamp-columns.mjs).
   */
  livenessColumn: string | null;
};

/** FIXED literal table map -- never build a table name from caller input (ruling requirement). */
const FAMILY_TABLE: Record<VoidDocumentFamily, FamilyTableSpec> = {
  load: { schema: "mdata", table: "loads", voidStatusValue: "voided", livenessColumn: "soft_deleted_at" },
  invoice: { schema: "accounting", table: "invoices", voidStatusValue: "void", livenessColumn: null },
  expense: { schema: "accounting", table: "expenses", voidStatusValue: "void", livenessColumn: null },
  factoring_advance: { schema: "accounting", table: "factoring_advances", voidStatusValue: "voided", livenessColumn: null },
  fuel_transaction: { schema: "fuel", table: "fuel_transactions", voidStatusValue: null, livenessColumn: "archived_at" },
  journal_entry: { schema: "accounting", table: "journal_entries", voidStatusValue: null, livenessColumn: null },
  driver_reimbursement: { schema: "driver_finance", table: "driver_reimbursements", voidStatusValue: "void", livenessColumn: null },
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
      // ROUND 138: an already-voided document may still have children that were never cascaded
      // (the EXACT historical defect this engine fixes -- 706 live settlement_lines under
      // already-voided settlements, measured before this existed). cascadeVoidChildren is itself
      // idempotent, so re-running it on every already_voided hit is safe and is how the backlog
      // gets closed without a separate one-time script.
      if (CASCADE_ELIGIBLE_FAMILIES.has(family)) {
        await cascadeVoidChildren(client, family as CascadeParentFamily, documentId, operatingCompanyId);
      }
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

  // ROUND 122 FIX: the status value is per-family (see FamilyTableSpec.voidStatusValue's own
  // comment) -- never the single literal 'voided' the original code wrote for every family.
  const applyStatusFlip = spec.voidStatusValue !== null;
  const voidedAtParam = params.voidedAt ?? new Date();
  const setClauses = ["voided_at = $2", "void_reason = $3", "voided_by_user_id = $4::uuid"];
  const queryParams: unknown[] = [documentId, voidedAtParam, voidReason, voidedByUserId, operatingCompanyId];
  if (applyStatusFlip) {
    queryParams.push(spec.voidStatusValue);
    setClauses.push(`status = $${queryParams.length}`);
  }
  // ROUND 131.2 FIX: write the SAME column the purge-window gate's own live_predicate reads, in the
  // SAME statement as the void stamp -- never a second write, never a caller-dependent patch (see
  // FamilyTableSpec.livenessColumn's own comment for the full reasoning). spec.livenessColumn is a
  // FIXED literal from FAMILY_TABLE above, never caller input, so direct interpolation here is safe
  // (same trust level as qualifiedTable itself).
  if (spec.livenessColumn) {
    setClauses.push(`${spec.livenessColumn} = $2`);
  }
  // ROUND 130.2 (Lead, P0, permanent fix, merged separately in #22442): mdata.loads
  // _operating_company_id_load_number_key is UNIQUE (operating_company_id, load_number) with NO
  // partial predicate -- a voided load keeps holding its load_number forever, so the AlwaysTrack
  // feed can never re-create that load number. Renumbers in the SAME UPDATE as the void stamp to
  // `VOID-<original>-<id8>`. Idempotent: guarded by `load_number NOT LIKE 'VOID%'`.
  if (family === "load") {
    setClauses.push(
      `load_number = CASE WHEN load_number NOT LIKE 'VOID%' THEN 'VOID-' || load_number || '-' || substr(replace(id::text, '-', ''), 1, 8) ELSE load_number END`
    );
  }

  const updateRes = await client.query<{ voided_at: string }>(
    `UPDATE ${qualifiedTable}
        SET ${setClauses.join(", ")}
      WHERE id = $1::uuid AND operating_company_id = $5::uuid
      RETURNING voided_at::text`,
    queryParams
  );
  const written = updateRes.rows[0];
  if (!written) {
    throw new VoidDocumentStampError(
      "document_write_race_lost",
      `stampDocumentVoided: UPDATE on ${qualifiedTable} for document ${documentId} matched no row (race with a concurrent write).`
    );
  }

  // ROUND 138: fresh stamp -- cascade to this document's own registered children in the SAME
  // transaction, never a separate write, never a caller that has to remember to do it itself.
  if (CASCADE_ELIGIBLE_FAMILIES.has(family)) {
    await cascadeVoidChildren(client, family as CascadeParentFamily, documentId, operatingCompanyId);
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
