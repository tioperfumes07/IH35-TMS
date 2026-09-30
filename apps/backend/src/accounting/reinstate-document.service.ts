/**
 * reinstateDocument() — ROUND 191 (owner order: universal unvoid / reinstate engine).
 *
 * Counterpart to voidDocument(). A void path with no reopen traps the book and blocks period
 * close. This is NOT a new GL engine: it clears void stamps via stampDocumentReinstated()
 * (metadata only) and voids the void's reversing JE via the EXISTING voidJournalEntry Option-1
 * path so the original posting stands alone again. Never re-posts. Never invents GL math.
 *
 * reinstated_* columns already exist on accounting.bills / bill_payments (and the rest measured
 * live 2026-09-28). This dispatcher is the missing writer + entry point.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  stampDocumentReinstated,
  VoidDocumentStampError,
  type QueryableClient,
  type ReinstateDocumentFamily,
} from "./void-document-stamp.service.js";
import type { VoidDocumentType } from "./void-document.service.js";
import { updateBankBalance, type BillMutationClient } from "./bills.service.js";

export type ReinstateDocumentType =
  | VoidDocumentType
  | "driver_bill"
  | "bank_transaction"
  | "check_number_registry"
  | "work_order";

export type ReinstateDocumentResult = {
  reinstatedAt: string;
  /** The void's reversing JE — caller voids it via voidJournalEntry AFTER this tx commits. */
  reinstatedFromVoidJeId: string | null;
  restoreStatus: string | null;
};

export class ReinstateDocumentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ReinstateDocumentError";
  }
}

type ReinstateClient = BillMutationClient & QueryableClient;

/**
 * Resolve the reversing JE produced when this source document was voided.
 * Prefer document-level columns when present; fall back to the original JE's reversed_by_je_id
 * via journal_entry_postings (the ACCT-F268 / posting-engine linkage — never memo parsing).
 */
export async function findVoidReversalJournalEntryId(
  client: QueryableClient,
  input: {
    operatingCompanyId: string;
    sourceTransactionType: string;
    sourceTransactionId: string;
    /** Prefer these when already known on the document row (expense.reversed_by_je_id, etc.). */
    preferredJeId?: string | null;
  }
): Promise<string | null> {
  if (input.preferredJeId) return input.preferredJeId;

  const res = await client.query<{ reversal_je_id: string }>(
    `SELECT je.reversed_by_je_id::text AS reversal_je_id
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je
         ON je.id = jep.journal_entry_uuid
        AND je.operating_company_id = jep.operating_company_id
      WHERE jep.operating_company_id = $1::uuid
        AND jep.source_transaction_type = $2
        AND jep.source_transaction_id = $3
        AND je.reversed_by_je_id IS NOT NULL
        AND je.reverses_je_id IS NULL
      ORDER BY jep.created_at ASC NULLS LAST
      LIMIT 1`,
    [input.operatingCompanyId, input.sourceTransactionType, input.sourceTransactionId]
  );
  return res.rows[0]?.reversal_je_id ?? null;
}

const DEFAULT_RESTORE_STATUS: Partial<Record<ReinstateDocumentType, string>> = {
  bill: "unpaid",
  bill_payment: "posted",
  expense: "draft",
  invoice: "sent",
  prepaid_purchase: "active",
  credit_memo: "issued",
  factoring_advance: "funded",
  // ROUND 274 — restore defaults for newly wired reinstate families.
  liability: "active",
  settlement: "open",
  driver_bill: "open",
  check_number_registry: "issued",
  work_order: "open",
  // journal_entry: status never flipped on void — leave untouched (restoreStatus ignored)
  // customer_payment / bank_transaction: no void-status column
};

/**
 * ONE entry point for reinstating a voided money document. Runs on the CALLER's transaction
 * client. After COMMIT, the caller MUST void reinstatedFromVoidJeId via voidJournalEntry when
 * non-null (Option-1 reverse-of-reversal) — same shape as unvoidCheck.
 */
export async function reinstateDocument(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    type: ReinstateDocumentType;
    id: string;
    reason: string;
    actor: { userId: string; role?: string };
    /** Override the default restore status for the family. */
    restoreStatus?: string | null;
  }
): Promise<ReinstateDocumentResult> {
  if (!input.reason?.trim()) {
    throw new ReinstateDocumentError("reinstate_reason_required", "reinstateDocument: reason is required.");
  }

  switch (input.type) {
    case "bill":
      return reinstateBill(client, input);
    case "bill_payment":
      return reinstateBillPayment(client, input);
    case "expense":
      return reinstateExpense(client, input);
    case "invoice":
      return reinstateSimple(client, input, "invoice", "invoice");
    case "customer_payment":
      return reinstateCustomerPayment(client, input);
    case "credit_memo":
      return reinstateCreditMemo(client, input);
    case "prepaid_purchase":
      return reinstatePrepaid(client, input);
    case "journal_entry":
      return reinstateJournalEntry(client, input);
    case "factoring_advance":
      // AUTH-113 hard line: do not touch factoring advances without reading OWNER-AUTHORIZATIONS.
      // The stamp path exists for parity; live callers must carry an AUTH id. Refuse by default.
      throw new ReinstateDocumentError(
        "factoring_reinstate_requires_auth",
        "reinstateDocument(factoring_advance): refused — read AUTH-113 before reinstating any factoring advance. Twins FAC-2026-00091..~00132 are already live and correct."
      );
    case "settlement":
      return reinstateSimple(client, input, "driver_settlement", "settlement");
    case "deduction":
      throw new ReinstateDocumentError(
        "not_yet_wired",
        "reinstateDocument: 'deduction' reinstate is not yet wired — driver-finance lane (void path voids the parent settlement/liability)."
      );
    case "liability":
      return reinstateSimple(client, input, "driver_liability", "liability");
    case "driver_bill":
      return reinstateSimple(client, input, "driver_bill", "driver_bill");
    case "bank_transaction":
      return reinstateSimple(client, input, "bank_transaction", "bank_transaction");
    case "check_number_registry":
      return reinstateSimple(client, input, "check_number_registry", "check_number_registry");
    case "work_order":
      return reinstateSimple(client, input, "work_order", "work_order");
    default: {
      const _exhaustive: never = input.type;
      throw new Error(`reinstateDocument: unhandled type ${_exhaustive as string}`);
    }
  }
}

async function stampAndAudit(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    type: ReinstateDocumentType;
    id: string;
    reason: string;
    actorUserId: string;
    family: ReinstateDocumentFamily;
    restoreStatus: string | null;
    restorePosted?: boolean;
    voidReversalJeId: string | null;
    auditAction: string;
    auditExtra?: Record<string, unknown>;
  }
): Promise<ReinstateDocumentResult> {
  const stamped = await stampDocumentReinstated(client, {
    operatingCompanyId: input.operatingCompanyId,
    family: input.family,
    documentId: input.id,
    reinstateReason: input.reason,
    reinstatedByUserId: input.actorUserId,
    reinstatedFromVoidJeId: input.voidReversalJeId,
    restoreStatus: input.restoreStatus,
    restorePosted: input.restorePosted === true,
  });
  await appendCrudAudit(
    client,
    input.actorUserId,
    input.auditAction,
    {
      resource_type: input.type,
      resource_id: input.id,
      operating_company_id: input.operatingCompanyId,
      reason: input.reason,
      reinstated_from_void_je_id: input.voidReversalJeId,
      ...(input.auditExtra ?? {}),
    },
    "warning",
    "R-191-UNIVERSAL-UNVOID"
  );
  return {
    reinstatedAt: stamped.reinstated_at,
    reinstatedFromVoidJeId: input.voidReversalJeId,
    restoreStatus: input.restoreStatus,
  };
}

async function reinstateBill(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    id: string;
    reason: string;
    actor: { userId: string };
    restoreStatus?: string | null;
  }
): Promise<ReinstateDocumentResult> {
  const billRes = await client.query<{
    id: string;
    status: string;
    voided_at: string | null;
    revoked_at: string | null;
    amount_cents: number | null;
    paid_cents: number | null;
  }>(
    `SELECT id::text, status, voided_at::text, revoked_at::text,
            amount_cents::bigint AS amount_cents, paid_cents::bigint AS paid_cents
       FROM accounting.bills
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.id, input.operatingCompanyId]
  );
  const bill = billRes.rows[0];
  if (!bill) throw new ReinstateDocumentError("bill_not_found", "Bill not found.");
  if (!bill.voided_at && !bill.revoked_at && bill.status !== "void" && bill.status !== "voided") {
    throw new ReinstateDocumentError("bill_not_void", "Bill is not void — nothing to reinstate.");
  }

  const voidReversalJeId = await findVoidReversalJournalEntryId(client, {
    operatingCompanyId: input.operatingCompanyId,
    sourceTransactionType: "bill",
    sourceTransactionId: input.id,
  });

  // Void zeroed paid_cents; restore to unpaid (or caller override).
  const restoreStatus = input.restoreStatus ?? DEFAULT_RESTORE_STATUS.bill ?? "unpaid";
  return stampAndAudit(client, {
    operatingCompanyId: input.operatingCompanyId,
    type: "bill",
    id: input.id,
    reason: input.reason,
    actorUserId: input.actor.userId,
    family: "bill",
    restoreStatus,
    voidReversalJeId,
    auditAction: "accounting.bill.reinstated",
  });
}

async function reinstateBillPayment(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    id: string;
    reason: string;
    actor: { userId: string };
    restoreStatus?: string | null;
  }
): Promise<ReinstateDocumentResult> {
  const payRes = await client.query<{
    id: string;
    bill_id: string;
    status: string;
    voided_at: string | null;
    revoked_at: string | null;
    amount_cents: number | null;
    amount: number | null;
    from_bank_account_id: string | null;
    void_reversal_entry_id: string | null;
  }>(
    `SELECT id::text, bill_id::text, status, voided_at::text, revoked_at::text,
            amount_cents::bigint AS amount_cents, amount,
            from_bank_account_id::text, void_reversal_entry_id::text
       FROM accounting.bill_payments
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.id, input.operatingCompanyId]
  );
  const payment = payRes.rows[0];
  if (!payment) throw new ReinstateDocumentError("bill_payment_not_found", "Bill payment not found.");
  if (!payment.voided_at && !payment.revoked_at && String(payment.status) !== "void") {
    throw new ReinstateDocumentError("bill_payment_not_void", "Bill payment is not void — nothing to reinstate.");
  }

  const billRes = await client.query<{
    id: string;
    amount_cents: number;
    paid_cents: number;
    status: string;
    revoked_at: string | null;
  }>(
    `SELECT id::text, amount_cents::bigint AS amount_cents, paid_cents::bigint AS paid_cents,
            status, revoked_at::text
       FROM accounting.bills
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [payment.bill_id, input.operatingCompanyId]
  );
  const bill = billRes.rows[0];
  if (!bill) throw new ReinstateDocumentError("bill_not_found", "Parent bill not found.");
  if (bill.revoked_at || bill.status === "void" || bill.status === "voided") {
    throw new ReinstateDocumentError(
      "parent_bill_void",
      "Cannot reinstate a payment on a voided bill — reinstate the bill first."
    );
  }

  const voidReversalJeId = await findVoidReversalJournalEntryId(client, {
    operatingCompanyId: input.operatingCompanyId,
    sourceTransactionType: "bill_payment",
    sourceTransactionId: input.id,
    preferredJeId: payment.void_reversal_entry_id,
  });

  const paymentAmountCents = Number(payment.amount_cents ?? Math.round(Number(payment.amount ?? 0) * 100));
  const newPaidCents = Number(bill.paid_cents) + paymentAmountCents;
  const billStatus =
    newPaidCents <= 0 ? "unpaid" : newPaidCents >= Number(bill.amount_cents) ? "paid" : "partially_paid";

  const restoreStatus = input.restoreStatus ?? DEFAULT_RESTORE_STATUS.bill_payment ?? "posted";
  const result = await stampAndAudit(client, {
    operatingCompanyId: input.operatingCompanyId,
    type: "bill_payment",
    id: input.id,
    reason: input.reason,
    actorUserId: input.actor.userId,
    family: "bill_payment",
    restoreStatus,
    voidReversalJeId,
    auditAction: "accounting.bill_payment.reinstated",
    auditExtra: { bill_id: payment.bill_id },
  });

  // Re-apply the payment onto the bill (void had subtracted it).
  await client.query(
    `UPDATE accounting.bills
        SET paid_cents = $2,
            paid_amount = $3,
            status = $4,
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $5::uuid`,
    [payment.bill_id, newPaidCents, newPaidCents / 100, billStatus, input.operatingCompanyId]
  );

  // Void of payment ADDED cash back to the bank cache; reinstate removes it again.
  if (payment.from_bank_account_id) {
    await updateBankBalance(client, input.operatingCompanyId, payment.from_bank_account_id, -Math.abs(paymentAmountCents));
  }

  return result;
}

async function reinstateExpense(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    id: string;
    reason: string;
    actor: { userId: string };
    restoreStatus?: string | null;
  }
): Promise<ReinstateDocumentResult> {
  const expRes = await client.query<{
    id: string;
    status: string;
    voided_at: string | null;
    posting_status: string;
    reversed_by_je_id: string | null;
    journal_entry_id: string | null;
  }>(
    `SELECT id::text, status, voided_at::text, posting_status,
            reversed_by_je_id::text, journal_entry_id::text
       FROM accounting.expenses
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.id, input.operatingCompanyId]
  );
  const exp = expRes.rows[0];
  if (!exp) throw new ReinstateDocumentError("expense_not_found", "Expense not found.");
  if (exp.status !== "void" && !exp.voided_at) {
    throw new ReinstateDocumentError("expense_not_void", "Expense is not void — nothing to reinstate.");
  }

  const voidReversalJeId = await findVoidReversalJournalEntryId(client, {
    operatingCompanyId: input.operatingCompanyId,
    sourceTransactionType: "expense",
    sourceTransactionId: input.id,
    preferredJeId: exp.reversed_by_je_id,
  });
  const wasReversed = Boolean(voidReversalJeId) || exp.posting_status === "reversed";
  const restorePosted = wasReversed && Boolean(exp.journal_entry_id);
  // Posted-then-voided expenses restore to 'posted'; unposted voids restore to 'draft'.
  const restoreStatus =
    input.restoreStatus ?? (restorePosted ? "posted" : DEFAULT_RESTORE_STATUS.expense ?? "draft");

  return stampAndAudit(client, {
    operatingCompanyId: input.operatingCompanyId,
    type: "expense",
    id: input.id,
    reason: input.reason,
    actorUserId: input.actor.userId,
    family: "expense",
    restoreStatus,
    restorePosted,
    voidReversalJeId,
    auditAction: "accounting.expense.reinstated",
  });
}

async function reinstateSimple(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    id: string;
    reason: string;
    actor: { userId: string };
    restoreStatus?: string | null;
    type: ReinstateDocumentType;
  },
  family: ReinstateDocumentFamily,
  sourceTransactionType: string
): Promise<ReinstateDocumentResult> {
  const voidReversalJeId = await findVoidReversalJournalEntryId(client, {
    operatingCompanyId: input.operatingCompanyId,
    sourceTransactionType,
    sourceTransactionId: input.id,
  });
  const restoreStatus = input.restoreStatus ?? DEFAULT_RESTORE_STATUS[input.type] ?? null;
  try {
    return await stampAndAudit(client, {
      operatingCompanyId: input.operatingCompanyId,
      type: input.type,
      id: input.id,
      reason: input.reason,
      actorUserId: input.actor.userId,
      family,
      restoreStatus,
      voidReversalJeId,
      auditAction: `accounting.${input.type}.reinstated`,
    });
  } catch (err) {
    if (err instanceof VoidDocumentStampError) {
      throw new ReinstateDocumentError(err.code, err.message);
    }
    throw err;
  }
}

async function reinstateCustomerPayment(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    id: string;
    reason: string;
    actor: { userId: string };
    restoreStatus?: string | null;
  }
): Promise<ReinstateDocumentResult> {
  // Re-open applications that were archived on void (unapplied_at set). Only those voided in the
  // same void event are recoverable via reinstated linkage — here we clear unapplied_at for rows
  // still pointing at this payment that were unapplied when the payment was voided.
  const result = await reinstateSimple(
    client,
    { ...input, type: "customer_payment" },
    "customer_payment",
    "customer_payment"
  );
  await client.query(
    `UPDATE accounting.payment_applications
        SET unapplied_at = NULL,
            unapplied_by_user_id = NULL
      WHERE payment_id = $1::uuid
        AND unapplied_at IS NOT NULL
        AND unapplied_by_user_id IS NOT NULL`,
    [input.id]
  );
  return result;
}

async function reinstateCreditMemo(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    id: string;
    reason: string;
    actor: { userId: string };
    restoreStatus?: string | null;
  }
): Promise<ReinstateDocumentResult> {
  // Credit memo void zeroes amount_applied and voids applications. Reinstate restores status to
  // 'issued' with amount_applied=0 (applications stay voided — re-apply is an explicit operator
  // action, never silent). No GL to reverse today (zero posting lines — TASK 18).
  const result = await reinstateSimple(client, { ...input, type: "credit_memo" }, "credit_memo", "credit_memo");
  await client.query(
    `UPDATE accounting.credit_memos
        SET amount_applied_cents = 0
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.id, input.operatingCompanyId]
  );
  return result;
}

async function reinstatePrepaid(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    id: string;
    reason: string;
    actor: { userId: string };
    restoreStatus?: string | null;
  }
): Promise<ReinstateDocumentResult> {
  const assetRes = await client.query<{
    posting_status: string | null;
    voided_at: string | null;
    status: string;
  }>(
    `SELECT posting_status::text, voided_at::text, status::text
       FROM accounting.prepaid_assets
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.id, input.operatingCompanyId]
  );
  const asset = assetRes.rows[0];
  if (!asset) throw new ReinstateDocumentError("prepaid_asset_not_found", "Prepaid asset not found.");
  if (!asset.voided_at && asset.status !== "voided") {
    throw new ReinstateDocumentError("prepaid_not_void", "Prepaid asset is not void — nothing to reinstate.");
  }
  const voidReversalJeId = await findVoidReversalJournalEntryId(client, {
    operatingCompanyId: input.operatingCompanyId,
    sourceTransactionType: "prepaid_purchase",
    sourceTransactionId: input.id,
  });
  const restorePosted = Boolean(voidReversalJeId) || asset.posting_status === "reversed";
  return stampAndAudit(client, {
    operatingCompanyId: input.operatingCompanyId,
    type: "prepaid_purchase",
    id: input.id,
    reason: input.reason,
    actorUserId: input.actor.userId,
    family: "prepaid_purchase",
    restoreStatus: input.restoreStatus ?? DEFAULT_RESTORE_STATUS.prepaid_purchase ?? "active",
    restorePosted,
    voidReversalJeId,
    auditAction: "accounting.prepaid_purchase.reinstated",
  });
}

async function reinstateJournalEntry(
  client: ReinstateClient,
  input: {
    operatingCompanyId: string;
    id: string;
    reason: string;
    actor: { userId: string };
  }
): Promise<ReinstateDocumentResult> {
  // JE void is Option-1 (a NEW reversing JE, original status left alone). Reinstate = void the
  // reversing JE that points at this one via reverses_je_id, then clear void stamps on the
  // ORIGINAL if any were written by stampDocumentVoided.
  const jeRes = await client.query<{
    id: string;
    voided_at: string | null;
    reversed_by_je_id: string | null;
  }>(
    `SELECT id::text, voided_at::text, reversed_by_je_id::text
       FROM accounting.journal_entries
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.id, input.operatingCompanyId]
  );
  const je = jeRes.rows[0];
  if (!je) throw new ReinstateDocumentError("journal_entry_not_found", "Journal entry not found.");

  const voidReversalJeId = je.reversed_by_je_id;
  if (!je.voided_at && !voidReversalJeId) {
    throw new ReinstateDocumentError(
      "journal_entry_not_void",
      "Journal entry is not void and has no reversing JE — nothing to reinstate."
    );
  }

  if (je.voided_at) {
    return stampAndAudit(client, {
      operatingCompanyId: input.operatingCompanyId,
      type: "journal_entry",
      id: input.id,
      reason: input.reason,
      actorUserId: input.actor.userId,
      family: "journal_entry",
      restoreStatus: null, // JE status never flipped on void
      voidReversalJeId,
      auditAction: "accounting.journal_entry.reinstated",
    });
  }

  // Stamp-less JE void (Option-1 only): record reinstate columns + clear reversed_by_je_id after
  // the caller voids the reversing JE. Write reinstated_* now; caller voids reversing JE after commit.
  await client.query(
    `UPDATE accounting.journal_entries
        SET reinstated_at = now(),
            reinstate_reason = $3,
            reinstated_by_user_id = $4::uuid,
            reinstated_from_void_je_id = $5::uuid,
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.id, input.operatingCompanyId, input.reason.trim(), input.actor.userId, voidReversalJeId]
  );
  await appendCrudAudit(
    client,
    input.actor.userId,
    "accounting.journal_entry.reinstated",
    {
      resource_type: "journal_entry",
      resource_id: input.id,
      reason: input.reason,
      reinstated_from_void_je_id: voidReversalJeId,
    },
    "warning",
    "R-191-UNIVERSAL-UNVOID"
  );
  return {
    reinstatedAt: new Date().toISOString(),
    reinstatedFromVoidJeId: voidReversalJeId,
    restoreStatus: null,
  };
}

/**
 * Convenience wrapper: runs reinstateDocument inside the caller's withCompanyScope tx shape, then
 * voids the reversing JE via voidJournalEntry (own connection) after commit. Prefer this from routes.
 */
export async function reinstateDocumentThenVoidReversal(
  runInTx: (fn: (client: ReinstateClient) => Promise<ReinstateDocumentResult>) => Promise<ReinstateDocumentResult>,
  input: {
    operatingCompanyId: string;
    type: ReinstateDocumentType;
    id: string;
    reason: string;
    actor: { userId: string; role?: string };
    restoreStatus?: string | null;
  }
): Promise<ReinstateDocumentResult> {
  const prepared = await runInTx((client) => reinstateDocument(client, input));

  if (prepared.reinstatedFromVoidJeId) {
    const { voidJournalEntry } = await import("./journal-entries.service.js");
    try {
      await voidJournalEntry(
        input.operatingCompanyId,
        prepared.reinstatedFromVoidJeId,
        `Unvoid ${input.type} ${input.id}: ${input.reason}`,
        { userId: input.actor.userId, role: input.actor.role ?? "Owner" }
      );
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (!/already.?void|voided/i.test(msg)) {
        throw new ReinstateDocumentError(
          "reinstate_reversal_void_failed",
          `Document reinstated, but voiding the reversing JE failed: ${msg}`
        );
      }
    }
  }
  return prepared;
}
