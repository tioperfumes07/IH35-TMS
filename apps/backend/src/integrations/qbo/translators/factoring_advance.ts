import { buildQboJournalEntryPayload } from "./journal_entry.js";

/** Factoring advance posts as a balanced JournalEntry (Debit Cash, Credit Liability). */
export function buildQboFactoringAdvanceJournalPayload(input: {
  txnDate: string;
  docNumber?: string | null;
  amountCents: number;
  memo: string;
  cashAccountQboId: string;
  liabilityAccountQboId: string;
  qbo_journal_entry_id?: string | null;
  qbo_sync_token?: string | null;
}): Record<string, unknown> {
  return buildQboJournalEntryPayload({
    txnDate: input.txnDate,
    docNumber: input.docNumber ?? undefined,
    adjustment: false,
    memo: input.memo,
    qbo_journal_entry_id: input.qbo_journal_entry_id,
    qbo_sync_token: input.qbo_sync_token,
    lines: [
      {
        postingType: "Debit",
        amountCents: input.amountCents,
        accountQboId: input.cashAccountQboId,
        description: input.memo,
      },
      {
        postingType: "Credit",
        amountCents: input.amountCents,
        accountQboId: input.liabilityAccountQboId,
        description: input.memo,
      },
    ],
  });
}
