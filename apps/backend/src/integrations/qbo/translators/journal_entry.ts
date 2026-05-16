import type { QboJournalLine } from "../qbo-api-types.js";
import { omitNullish } from "./_omit.js";

export type ResolvedJeLineInput = {
  qboLineId?: string;
  postingType: "Debit" | "Credit";
  amountCents: number;
  accountQboId: string;
  classQboId?: string;
  entity?: { Type: string; EntityRef: { value: string } };
  description?: string | null;
};

export function buildQboJournalEntryPayload(input: {
  txnDate: string;
  docNumber?: string | null;
  adjustment: boolean;
  memo?: string | null;
  qbo_journal_entry_id?: string | null;
  qbo_sync_token?: string | null;
  lines: ResolvedJeLineInput[];
}): Record<string, unknown> {
  const lines: QboJournalLine[] = input.lines.map((line) =>
    omitNullish({
      ...(line.qboLineId ? { Id: line.qboLineId } : {}),
      Amount: Math.abs(line.amountCents) / 100,
      DetailType: "JournalEntryLineDetail" as const,
      JournalEntryLineDetail: omitNullish({
        PostingType: line.postingType,
        AccountRef: { value: line.accountQboId },
        ...(line.classQboId ? { ClassRef: { value: line.classQboId } } : {}),
        ...(line.entity ? { Entity: line.entity } : {}),
      }) as QboJournalLine["JournalEntryLineDetail"],
      Description: line.description ?? undefined,
    }) as QboJournalLine
  );

  const base = omitNullish({
    TxnDate: input.txnDate.slice(0, 10),
    Adjustment: input.adjustment,
    ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
    ...(input.memo ? { PrivateNote: input.memo } : {}),
    Line: lines,
  });

  const isPatch = Boolean(input.qbo_journal_entry_id && input.qbo_sync_token);
  if (isPatch) {
    return omitNullish({
      ...base,
      Id: input.qbo_journal_entry_id,
      SyncToken: input.qbo_sync_token,
      sparse: true,
    });
  }
  return base;
}
