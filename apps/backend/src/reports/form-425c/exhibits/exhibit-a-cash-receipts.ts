import type { ExhibitPeriod, ExhibitQueryClient } from "./types.js";

export type CashReceiptRow = {
  source_type: string;
  source_label: string;
  amount_cents: number;
  txn_count: number;
};

export type ExhibitA = {
  letter: "a";
  title: string;
  period_start: string;
  period_end: string;
  rows: CashReceiptRow[];
  total_cents: number;
};

function classifyReceiptSource(description: string, counterparty: string | null): string {
  const hay = `${description} ${counterparty ?? ""}`.toLowerCase();
  if (hay.includes("factor") || hay.includes("triumph") || hay.includes("rts")) return "factor";
  if (hay.includes("refund") || hay.includes("return")) return "refund";
  if (hay.includes("customer") || hay.includes("invoice") || hay.includes("ar ")) return "customer";
  return "other";
}

export async function buildExhibitA(
  client: ExhibitQueryClient,
  input: ExhibitPeriod
): Promise<ExhibitA> {
  // REAL schema (db/migrations/0072,0073): amount_cents (bigint, signed-Plaid), bank_account_id,
  // transaction_date, merchant_name, is_credit. Receipts = money IN = is_credit=true. We GROUP ON
  // is_credit (the canonical direction flag the GL poster trusts), NEVER the amount_cents sign —
  // amount_cents is stored on the Plaid convention (negative = deposit) so a sign test would file
  // receipts/disbursements SWAPPED on the court MOR. Magnitude via abs(amount_cents).
  // Own-transfers between the debtor's own accounts are excluded (mirrors bank-feed-gl-posting
  // service.ts:155 — review_state='transfer' / transfer_kind / destination_bank_account_id).
  // NO .catch(): a broken query must FAIL LOUD, never silently render a blank court exhibit.
  const res = await client.query<{
    description: string;
    counterparty: string | null;
    amount_cents: string;
  }>(
    `
      SELECT bt.description, bt.merchant_name AS counterparty, abs(bt.amount_cents)::bigint AS amount_cents
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts a ON a.id = bt.bank_account_id
      WHERE bt.operating_company_id = $1::uuid
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND bt.is_credit = true
        AND bt.transaction_date >= $2::date
        AND bt.transaction_date <= $3::date
        AND bt.review_state IS DISTINCT FROM 'transfer'
        AND bt.transfer_kind IS NULL
        AND bt.destination_bank_account_id IS NULL
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  const buckets = new Map<string, { amount_cents: number; txn_count: number }>();
  for (const row of res.rows) {
    const source = classifyReceiptSource(String(row.description ?? ""), row.counterparty ? String(row.counterparty) : null);
    const cents = Math.trunc(Number(row.amount_cents ?? 0));
    const prev = buckets.get(source) ?? { amount_cents: 0, txn_count: 0 };
    buckets.set(source, { amount_cents: prev.amount_cents + cents, txn_count: prev.txn_count + 1 });
  }

  const labelBySource: Record<string, string> = {
    customer: "Customer receipts",
    factor: "Factoring advances",
    refund: "Refunds / returns",
    other: "Other receipts",
  };

  const rows: CashReceiptRow[] = [...buckets.entries()]
    .map(([source_type, agg]) => ({
      source_type,
      source_label: labelBySource[source_type] ?? source_type,
      amount_cents: agg.amount_cents,
      txn_count: agg.txn_count,
    }))
    .sort((a, b) => b.amount_cents - a.amount_cents);

  const total_cents = rows.reduce((sum, row) => sum + row.amount_cents, 0);

  return {
    letter: "a",
    title: "Exhibit A — Cash receipts detail",
    period_start: input.period_start,
    period_end: input.period_end,
    rows,
    total_cents,
  };
}
