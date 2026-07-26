/**
 * BANK-DOM-04 — reconciling-item aging + classification + escalation.
 * Standard: finance:reconciliation (timing / adjustment / investigate; 0-30 / 31-60 / 61-90 / 90+).
 * Pure helper — no GL math. Escalation default: investigate + days > 90.
 */

export type ReconcilingItemClass = "timing" | "adjustment" | "investigate";
export type AgeBucket = "0-30" | "31-60" | "61-90" | "90+";

export type UnclearedTxnInput = {
  id: string;
  transaction_date: string;
  amount_cents: number;
  is_credit: boolean;
  description?: string | null;
  merchant_name?: string | null;
  /** Optional operator override (persisted when migration lands). */
  reconciling_item_class?: ReconcilingItemClass | null;
};

export type AgedReconcilingItem = {
  id: string;
  transaction_date: string;
  amount_cents: number;
  is_credit: boolean;
  description: string | null;
  merchant_name: string | null;
  days_outstanding: number;
  age_bucket: AgeBucket;
  classification: ReconcilingItemClass;
  escalated: boolean;
};

export const DEFAULT_ESCALATION_DAYS = 90;

export function ageBucketForDays(days: number): AgeBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function defaultClassification(days: number, override?: ReconcilingItemClass | null): ReconcilingItemClass {
  if (override) return override;
  if (days > DEFAULT_ESCALATION_DAYS) return "investigate";
  return "timing";
}

function parseDateOnly(value: string): Date {
  // Treat as UTC date-only to keep bucket math stable across TZ.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return new Date(value);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function daysOutstanding(transactionDate: string, asOf: Date = new Date()): number {
  const txn = parseDateOnly(transactionDate);
  const asOfUtc = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const txnUtc = Date.UTC(txn.getUTCFullYear(), txn.getUTCMonth(), txn.getUTCDate());
  const diff = Math.floor((asOfUtc - txnUtc) / 86_400_000);
  return Math.max(0, diff);
}

export function ageUnclearedTransactions(
  items: UnclearedTxnInput[],
  opts?: { asOf?: Date; escalationDays?: number }
): AgedReconcilingItem[] {
  const asOf = opts?.asOf ?? new Date();
  const escalationDays = opts?.escalationDays ?? DEFAULT_ESCALATION_DAYS;
  return items.map((t) => {
    const days = daysOutstanding(t.transaction_date, asOf);
    const classification = defaultClassification(days, t.reconciling_item_class);
    const escalated = days > escalationDays || classification === "investigate";
    return {
      id: t.id,
      transaction_date: t.transaction_date,
      amount_cents: t.amount_cents,
      is_credit: t.is_credit,
      description: t.description ?? null,
      merchant_name: t.merchant_name ?? null,
      days_outstanding: days,
      age_bucket: ageBucketForDays(days),
      classification,
      escalated,
    };
  });
}
