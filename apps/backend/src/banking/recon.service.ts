import { getSuggestionsForTxn } from "../factoring/bank-match.service.js";
import { logger } from "../observability/structured-logger.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type BankingReconSuggestion = {
  obligation_type: "load" | "settlement" | "fuel" | "work_order" | "ar_invoice" | "bill" | "expense" | "factoring_batch";
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
  // Best-effort append: factoring suggestions are layered ON TOP of the base obligation matches,
  // so a factoring-lookup failure must NOT blow up the whole suggestions panel. But it must also
  // never vanish silently — a swallowed error here previously looked identical to "no factoring
  // match", hiding a real query failure on a money-reconciliation path. Log with context and fall
  // back to the base suggestions (SWL-2). Convention: best-effort/side path → log, do not rethrow.
  let factoring: Awaited<ReturnType<typeof getSuggestionsForTxn>> = [];
  try {
    factoring = await getSuggestionsForTxn(input.bank_transaction_id, input.operating_company_id, {
      client: input.client,
    });
  } catch (err) {
    logger.error("banking-recon: factoring suggestion lookup failed — returning base suggestions only", err, {
      company_id: input.operating_company_id,
      bank_transaction_id: input.bank_transaction_id,
      surface: "banking.appendFactoringSuggestions",
    });
    factoring = [];
  }

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
