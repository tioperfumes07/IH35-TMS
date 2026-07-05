import type { ExhibitPeriod, ExhibitQueryClient } from "./types.js";

export type DisbursementRow = {
  vendor_name: string;
  category: string;
  amount_cents: number;
  txn_count: number;
};

export type ExhibitB = {
  letter: "b";
  title: string;
  period_start: string;
  period_end: string;
  rows: DisbursementRow[];
  total_cents: number;
};

function classifyDisbursementCategory(description: string): string {
  const hay = description.toLowerCase();
  if (hay.includes("fuel") || hay.includes("pilot") || hay.includes("loves")) return "fuel";
  if (hay.includes("payroll") || hay.includes("settlement") || hay.includes("driver")) return "driver_pay";
  if (hay.includes("insurance")) return "insurance";
  if (hay.includes("maintenance") || hay.includes("repair")) return "maintenance";
  if (hay.includes("toll") || hay.includes("prepass")) return "tolls";
  if (hay.includes("attorney") || hay.includes("legal") || hay.includes("trustee")) return "professional_fees";
  return "other";
}

export async function buildExhibitB(
  client: ExhibitQueryClient,
  input: ExhibitPeriod
): Promise<ExhibitB> {
  // REAL schema (db/migrations/0072,0073). Disbursements = money OUT = is_credit=false. GROUP ON
  // is_credit (canonical direction flag), NEVER the amount_cents sign — amount_cents is Plaid-signed
  // (negative = deposit), so a sign test would file receipts/disbursements SWAPPED on the court MOR.
  // Magnitude via abs(amount_cents). Own-transfers excluded (mirrors bank-feed-gl-posting.service.ts:155).
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
      WHERE bt.operating_company_id = $1
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND bt.is_credit = false
        AND bt.transaction_date >= $2::date
        AND bt.transaction_date <= $3::date
        AND bt.review_state IS DISTINCT FROM 'transfer'
        AND bt.transfer_kind IS NULL
        AND bt.destination_bank_account_id IS NULL
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  const buckets = new Map<string, DisbursementRow>();
  for (const row of res.rows) {
    const vendor = String(row.counterparty ?? row.description ?? "Unknown vendor").trim() || "Unknown vendor";
    const category = classifyDisbursementCategory(String(row.description ?? ""));
    const key = `${vendor}::${category}`;
    const cents = Math.trunc(Number(row.amount_cents ?? 0));
    const prev = buckets.get(key);
    if (prev) {
      prev.amount_cents += cents;
      prev.txn_count += 1;
    } else {
      buckets.set(key, { vendor_name: vendor, category, amount_cents: cents, txn_count: 1 });
    }
  }

  const rows = [...buckets.values()].sort((a, b) => b.amount_cents - a.amount_cents);
  const total_cents = rows.reduce((sum, row) => sum + row.amount_cents, 0);

  return {
    letter: "b",
    title: "Exhibit B — Cash disbursements detail",
    period_start: input.period_start,
    period_end: input.period_end,
    rows,
    total_cents,
  };
}
