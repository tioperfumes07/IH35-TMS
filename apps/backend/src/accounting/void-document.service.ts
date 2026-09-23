/**
 * voidDocument() — ROUND 31.2/32.2 (Lead ruling; LEAD CORRECTION 2026-09-22, standing rule §8:
 * "before any seat builds a thing, it greps for that thing... A PR creating a second... reversal
 * engine fails review on sight.").
 *
 * This is NOT a new reversal engine. A census of the real void routes in this seat's lane
 * (bills, bill payments, expenses, invoices, journal entries, prepaid purchases, factoring
 * advances, customer payments) found THREE already-correct, already-reused reversal engines, each
 * already wired to its own routes:
 *   - postVoidReversal            (./void.service.ts)          — invoices, prepaid, bulk-void
 *   - reversePostedSourceTransactionInClientTx (./posting-engine.service.ts) — expenses, WOs,
 *     governance void executors
 *   - reverseFactoringAdvanceEvent (./factoring-posting/poster.service.ts) — factoring advances
 * (`voidBillInClientTx` / `voidBillPaymentInClientTx` in ./bills.service.ts call postVoidReversal
 * internally, so "bill"/"bill_payment" route through it too.)
 *
 * The real gap was never "25 of 29 routes silently skip reversal" (the Lead's own first number —
 * retracted, verified overstated). The real gap is that there is no SINGLE NAMED ENTRY POINT, so a
 * future void route has nothing forcing it to call one of the three engines above instead of a bare
 * status flip. This file is that entry point: a thin dispatcher that calls the correct EXISTING
 * engine per entity type, in that engine's own already-proven-correct transaction/connection shape
 * — never reimplementing GL math.
 *
 * 'deduction' and 'settlement' (VOID-DOCUMENT-DEDUCTION-SETTLEMENT-ENTITY-NUANCE, GUARD-WORKORDERS
 * row filed by CC-3 2026-09-23, "inverted the dependency" per Round 35.3): driver-finance/**
 * (CC-3's lane) exports the two callees this dispatcher needs —
 * `driver-finance/void-document-callees.service.ts`'s `reverseSettlementForVoid` /
 * `reverseDeductionForVoid` — each a thin wrapper over an ALREADY-CORRECT, ALREADY-OWNER-RULED
 * engine (reverseSettlementBillPaymentInClientTx for settlement; voidSettlementDeduction's
 * pending/partial/applied three-branch dispatch for deduction — an 'applied' deduction is NEVER
 * reversed, "why would I forgive the debt", 2026-09-05). This dispatcher calls them verbatim, no
 * new GL math, no new preconditions — exactly the shape every other case in this switch follows.
 *
 * TWO entity types in this lane are deliberately NOT wired yet: 'credit_memo' and 'liability'.
 * credit_memos.routes.ts's void route has no `source_transaction_type='credit_memo'` reference
 * anywhere in the codebase (grep-confirmed) — no GL posting exists at that source type today, so
 * there may be nothing to reverse; but driver_finance.driver_liabilities can originate from a
 * POSTED safety-fine conversion (safety-fine-posting/poster.service.ts), so liabilities.routes.ts's
 * bare status-flip void may be a REAL gap, not a "nothing to reverse" case. Wiring either one on a
 * guess would misrepresent a void as reversed (or as safely unreversed) without evidence — both
 * throw NOT_YET_WIRED below until that trace is done. Calling voidDocument() with either type is a
 * loud, immediate failure, never a silent no-op.
 */
import {
  postVoidReversal,
  type VoidableEntityType,
} from "./void.service.js";
import { voidBillInClientTx, voidBillPaymentInClientTx, type BillMutationClient } from "./bills.service.js";
import { reversePostedSourceTransactionInClientTx } from "./posting-engine.service.js";
import { reverseFactoringAdvanceEvent } from "./factoring-posting/poster.service.js";
import { reverseSettlementForVoid, reverseDeductionForVoid } from "../driver-finance/void-document-callees.service.js";

export type VoidDocumentType =
  | "bill"
  | "bill_payment"
  | "expense"
  | "invoice"
  | "journal_entry"
  | "prepaid_purchase"
  | "factoring_advance"
  | "customer_payment"
  | "credit_memo"
  | "liability"
  | "deduction"
  | "settlement";

export type VoidDocumentResult = {
  voidedAt: string;
  reversalJournalEntryId: string | null;
};

type VoidDocumentClient = BillMutationClient;

export class VoidDocumentNotYetWiredError extends Error {
  constructor(public readonly type: VoidDocumentType, reason: string) {
    super(`voidDocument: '${type}' is NOT YET WIRED — ${reason}`);
    this.name = "VoidDocumentNotYetWiredError";
  }
}

/**
 * ONE entry point for the 8 confirmed entity types in this lane. Every call happens inside the
 * caller's OWN transaction client for the engines that accept one (bill, bill_payment, expense,
 * invoice, prepaid_purchase) — atomic with whatever else the caller does in that transaction.
 * `journal_entry` and `factoring_advance` call engines that open their OWN connection BY DESIGN
 * (journal-entries.service.ts's voidJournalEntry; the factoring lock-ordering fix ACCT-F5980) —
 * this dispatcher preserves that shape rather than forcing a false atomicity the real engines
 * don't have. Callers needing a true single-transaction guarantee for those two types must call
 * this BEFORE opening their own transaction, or accept the two-phase shape the existing engines
 * already use in production.
 */
export async function voidDocument(
  client: VoidDocumentClient,
  input: {
    operatingCompanyId: string;
    type: VoidDocumentType;
    id: string;
    reason: string;
    actor: { userId: string; role?: string };
    currentBusinessDate: string;
  }
): Promise<VoidDocumentResult> {
  const nowIso = () => new Date().toISOString();

  switch (input.type) {
    case "bill": {
      const result = await voidBillInClientTx(client, {
        operatingCompanyId: input.operatingCompanyId,
        billId: input.id,
        reason: input.reason,
        userId: input.actor.userId,
        currentBusinessDate: input.currentBusinessDate,
      });
      return { voidedAt: nowIso(), reversalJournalEntryId: result.reversal_journal_entry_id ?? null };
    }

    case "bill_payment": {
      const result = await voidBillPaymentInClientTx(client, {
        operatingCompanyId: input.operatingCompanyId,
        paymentId: input.id,
        reason: input.reason,
        userId: input.actor.userId,
        currentBusinessDate: input.currentBusinessDate,
      });
      return { voidedAt: nowIso(), reversalJournalEntryId: result.reversal_journal_entry_id ?? null };
    }

    case "expense": {
      // Matches expenses.routes.ts's own SOURCE_NOT_FOUND handling — an unposted expense
      // legitimately has nothing to reverse; every other posting-engine error still throws.
      let reversalJournalEntryId: string | null = null;
      try {
        const rev = await reversePostedSourceTransactionInClientTx(
          client,
          {
            operating_company_id: input.operatingCompanyId,
            source_transaction_type: "expense",
            source_transaction_id: input.id,
          },
          { userId: input.actor.userId },
          input.currentBusinessDate
        );
        reversalJournalEntryId = rev.journal_entry_id ?? null;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== "SOURCE_NOT_FOUND") throw err;
      }
      return { voidedAt: nowIso(), reversalJournalEntryId };
    }

    case "invoice":
    case "prepaid_purchase":
    case "customer_payment": {
      const entityType: VoidableEntityType =
        input.type === "prepaid_purchase" ? "prepaid_purchase" : input.type === "customer_payment" ? "customer_payment" : "invoice";
      const reversal = await postVoidReversal(
        client,
        {
          operatingCompanyId: input.operatingCompanyId,
          entityType,
          entityId: input.id,
          originalDate: input.currentBusinessDate,
          memo: `Void: ${entityType} ${input.id}: ${input.reason}`,
        },
        { userId: input.actor.userId }
      );
      return { voidedAt: nowIso(), reversalJournalEntryId: reversal.reversal_journal_entry_id };
    }

    case "journal_entry": {
      // voidJournalEntry (journal-entries.service.ts) opens its OWN connection by design (Option-1
      // reversing-entry model) — not composable into the caller's transaction. Preserved as-is.
      const { voidJournalEntry } = await import("./journal-entries.service.js");
      const result = await voidJournalEntry(input.operatingCompanyId, input.id, input.reason, {
        userId: input.actor.userId,
        role: input.actor.role ?? "",
      });
      return {
        voidedAt: nowIso(),
        reversalJournalEntryId: (result as { reversal_journal_entry_id?: string | null })?.reversal_journal_entry_id ?? null,
      };
    }

    case "factoring_advance": {
      // reverseFactoringAdvanceEvent opens its OWN connection by design (ACCT-F5980 lock-ordering
      // fix — must complete BEFORE the caller's own status-UPDATE takes its row lock). Preserved
      // as-is, matching factoring-advances.routes.ts's own call order exactly.
      const result = await reverseFactoringAdvanceEvent({
        operating_company_id: input.operatingCompanyId,
        factoring_advance_id: input.id,
        actor_user_id: input.actor.userId,
        reason: input.reason,
      });
      return {
        voidedAt: nowIso(),
        reversalJournalEntryId: result.reversed ? result.reversal_journal_entry_id : null,
      };
    }

    case "settlement": {
      const result = await reverseSettlementForVoid(client, {
        operatingCompanyId: input.operatingCompanyId,
        settlementId: input.id,
        reason: input.reason,
        actor: { userId: input.actor.userId },
      });
      return { voidedAt: result.voidedAt, reversalJournalEntryId: result.reversalJournalEntryId };
    }

    case "deduction": {
      const result = await reverseDeductionForVoid(client, {
        operatingCompanyId: input.operatingCompanyId,
        deductionId: input.id,
        reason: input.reason,
        actor: { userId: input.actor.userId },
      });
      return { voidedAt: result.voidedAt, reversalJournalEntryId: result.reversalJournalEntryId };
    }

    case "credit_memo":
      throw new VoidDocumentNotYetWiredError(
        input.type,
        "no source_transaction_type='credit_memo' posting exists anywhere in the codebase (grep-" +
          "confirmed) — needs a real trace of whether credit-memo application nets against a live " +
          "GL posting before this can be wired safely, not assumed either way."
      );

    case "liability":
      throw new VoidDocumentNotYetWiredError(
        input.type,
        "driver_finance.driver_liabilities can originate from a POSTED safety-fine conversion " +
          "(safety-fine-posting/poster.service.ts) — liabilities.routes.ts's void route today only " +
          "flips status, with no reversal call. Needs the real source_transaction_type trace before " +
          "this can be wired, not assumed safe."
      );

    default: {
      const _exhaustive: never = input.type;
      throw new Error(`voidDocument: unhandled type ${_exhaustive as string}`);
    }
  }
}
