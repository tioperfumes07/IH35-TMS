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
  const res = await client.query<{
    description: string;
    counterparty: string | null;
    amount: string;
  }>(
    `
      SELECT bt.description, bt.counterparty_name AS counterparty, bt.amount::numeric AS amount
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts a ON a.id = bt.account_id
      WHERE bt.operating_company_id = $1
        AND a.is_dip = true
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND COALESCE(a.tag, '') NOT IN ('Factoring', 'Escrow')
        AND bt.amount > 0
        AND bt.txn_date >= $2::date
        AND bt.txn_date <= $3::date
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  ).catch(() => ({ rows: [] }));

  const buckets = new Map<string, { amount_cents: number; txn_count: number }>();
  for (const row of res.rows) {
    const source = classifyReceiptSource(String(row.description ?? ""), row.counterparty ? String(row.counterparty) : null);
    const cents = Math.round(Number(row.amount ?? 0) * 100);
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
