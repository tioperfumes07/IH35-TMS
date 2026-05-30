import { getSuggestionsForTxn } from "../factoring/bank-match.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type BankingReconSuggestion = {
  obligation_type: "load" | "settlement" | "fuel" | "work_order" | "ar_invoice" | "bill" | "factoring_batch";
  obligation_id: string;
  label: string;
  amount_cents: number;
  event_date: string;
  confidence: number;
  lev: number;
  suggestion_source: "obligation" | "factoring";
  bank_match_suggestion_id?: string;
  batch_number?: string;
};

export async function appendFactoringSuggestions(input: {
  client: Queryable;
  operating_company_id: string;
  bank_transaction_id: string;
  baseSuggestions: BankingReconSuggestion[];
}) {
  const factoring = await getSuggestionsForTxn(input.bank_transaction_id, input.operating_company_id, {
    client: input.client,
  }).catch(() => []);

  const factoringSuggestions: BankingReconSuggestion[] = factoring.map((row) => ({
    obligation_type: "factoring_batch",
    obligation_id: row.batch_id,
    label: `Factoring batch ${row.batch_number}`,
    amount_cents: row.expected_advance_cents,
    event_date: row.submitted_at ? row.submitted_at.slice(0, 10) : "",
    confidence: row.confidence,
    lev: 0,
    suggestion_source: "factoring",
    bank_match_suggestion_id: row.id,
    batch_number: row.batch_number,
  }));

  return [...input.baseSuggestions, ...factoringSuggestions];
}
