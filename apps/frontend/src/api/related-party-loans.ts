/**
 * Loans & Advances (related-party loans) — typed client.
 *
 * Bound field-for-field to the LIVE backend contract in
 * apps/backend/src/accounting/related-party-loan-posting/routes.ts (registered in index.ts via
 * registerRelatedPartyLoanRoutes). The backend, its migrations
 * (202611230000_related_party_loans_data_model.sql, 202611260000_related_party_loan_auto_deduct.sql)
 * and the posting/auto-deduct/reminder wiring already shipped; only this UI was missing.
 *
 * The request type mirrors `createBodySchema` exactly so a rendered wizard field cannot be dropped
 * from the payload (DoD-B). Posting is the backend's job — this client never computes GL.
 */
import { apiRequest } from "./client";

export type LoanDirection = "in" | "out";
export type LoanRelationship = "owner" | "spouse" | "friend" | "employee" | "related_company" | "other";
export type LoanCounterpartyKind = "user" | "driver" | "vendor" | "company" | "other";
export type LoanTargetType =
  | "bill"
  | "settlement"
  | "cash_advance"
  | "expense"
  | "loan_out"
  | "repayment"
  | "intercompany";
export type LoanStatus = "draft" | "open" | "paid" | "reversed";
export type LoanInterestMethod = "simple" | "amortized" | "none";
export type LoanPaymentFrequency =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "per_settlement"
  | "lump_sum";

/** Mirrors backend `createBodySchema`. Optional here === optional there — nothing invented. */
export type CreateRelatedPartyLoanRequest = {
  operating_company_id: string;
  direction: LoanDirection;
  relationship: LoanRelationship;
  counterparty_kind: LoanCounterpartyKind;
  counterparty_id?: string | null;
  counterparty_name?: string;
  account_id: string;
  target_type: LoanTargetType;
  target_id?: string | null;
  principal_cents: number;
  entry_date: string;
  interest_rate_bps: number;
  interest_method?: LoanInterestMethod;
  payment_frequency?: LoanPaymentFrequency;
  payment_count?: number | null;
  first_payment_date?: string;
  funding_source_note?: string;
};

export type RelatedPartyLoanRow = {
  id: string;
  operating_company_id: string;
  direction: LoanDirection;
  relationship: LoanRelationship;
  counterparty_kind?: LoanCounterpartyKind | null;
  counterparty_id?: string | null;
  counterparty_name?: string | null;
  account_id: string;
  account_name?: string | null;
  target_type: LoanTargetType;
  target_id?: string | null;
  principal_cents: number;
  amount_cents?: number | null;
  entry_date: string;
  interest_rate_bps?: number | null;
  status?: LoanStatus | null;
  je_id?: string | null;
  funding_source_note?: string | null;
  created_at?: string | null;
};

export type ListRelatedPartyLoansQuery = {
  operating_company_id: string;
  direction?: LoanDirection;
  target_type?: LoanTargetType;
  counterparty_id?: string;
  status?: LoanStatus;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type ListRelatedPartyLoansResponse = {
  rows?: RelatedPartyLoanRow[];
  items?: RelatedPartyLoanRow[];
  total?: number;
  limit?: number;
  offset?: number;
};

const BASE = "/api/v1/accounting/related-party-loans";

export function listRelatedPartyLoansUrl(q: ListRelatedPartyLoansQuery): string {
  const p = new URLSearchParams();
  p.set("operating_company_id", q.operating_company_id);
  if (q.direction) p.set("direction", q.direction);
  if (q.target_type) p.set("target_type", q.target_type);
  if (q.counterparty_id) p.set("counterparty_id", q.counterparty_id);
  if (q.status) p.set("status", q.status);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (typeof q.limit === "number") p.set("limit", String(q.limit));
  if (typeof q.offset === "number") p.set("offset", String(q.offset));
  return `${BASE}?${p.toString()}`;
}

export async function listRelatedPartyLoans(
  q: ListRelatedPartyLoansQuery,
  signal?: AbortSignal,
): Promise<ListRelatedPartyLoansResponse> {
  return apiRequest<ListRelatedPartyLoansResponse>(listRelatedPartyLoansUrl(q), { method: "GET", signal });
}

export async function getRelatedPartyLoan(id: string, signal?: AbortSignal): Promise<RelatedPartyLoanRow> {
  return apiRequest<RelatedPartyLoanRow>(`${BASE}/${id}`, { method: "GET", signal });
}

export async function previewLoanInterestAccrual(
  id: string,
  operatingCompanyId: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const p = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest(`${BASE}/${id}/interest-accrual/preview?${p.toString()}`, { method: "GET", signal });
}

export async function createRelatedPartyLoan(
  body: CreateRelatedPartyLoanRequest,
): Promise<RelatedPartyLoanRow> {
  return apiRequest<RelatedPartyLoanRow>(BASE, { method: "POST", body });
}

/** Rows come back under `rows` or `items` depending on the list shape; normalise once, here. */
export function loanRowsOf(res: ListRelatedPartyLoansResponse | undefined): RelatedPartyLoanRow[] {
  if (!res) return [];
  return res.rows ?? res.items ?? [];
}
