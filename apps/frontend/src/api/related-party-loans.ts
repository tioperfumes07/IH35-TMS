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
import { appendStatusList } from "../lib/statusListParams";

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
  | "intercompany"
  | "bank_funding"
  | "bank_repayment";
export type LoanStatus = "draft" | "open" | "paid" | "reversed";
export type LoanInterestMethod = "simple" | "amortized" | "none";
export type LoanPaymentFrequency =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "per_settlement"
  | "lump_sum";
export type LoanDocumentKind = "funding" | "repayment" | "manual";

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
  /** ROUND 443.22-2a — bank Loan action stamps reverse pointer on the bank line. */
  bank_transaction_id?: string | null;
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
  facility_id?: string | null;
  display_id?: string | null;
  document_kind?: LoanDocumentKind | null;
  /** ROUND 443.22-2c — docs.files id of the minted advance note (funding IN only). */
  note_file_id?: string | null;
  has_note?: boolean | null;
  funding_source_note?: string | null;
  created_at?: string | null;
};

/** Option 1 LOC header — one running facility per related-party CoA account / person. */
export type RelatedPartyLoanFacilityRow = {
  id: string;
  operating_company_id: string;
  account_id: string;
  account_number?: string | null;
  account_name?: string | null;
  counterparty_name?: string | null;
  relationship: LoanRelationship | string;
  status: string;
  principal_advanced_cents: number;
  principal_repaid_cents: number;
  open_balance_cents: number;
  accrued_interest_cents: number;
  advance_count: number;
  repayment_count: number;
  created_at?: string | null;
};

export type ListRelatedPartyLoansQuery = {
  operating_company_id: string;
  direction?: LoanDirection;
  target_type?: LoanTargetType;
  facility_id?: string;
  counterparty_id?: string;
  status?: LoanStatus | ReadonlyArray<LoanStatus>;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type ListRelatedPartyLoansResponse = {
  /** Live list route returns `{ loans, total_count, has_more }` (related-party-loan-posting/routes.ts). */
  loans?: RelatedPartyLoanRow[];
  rows?: RelatedPartyLoanRow[];
  items?: RelatedPartyLoanRow[];
  total_count?: number;
  total?: number;
  has_more?: boolean;
  limit?: number;
  offset?: number;
};

export type ListRelatedPartyLoanFacilitiesResponse = {
  facilities: RelatedPartyLoanFacilityRow[];
  total_count?: number;
};

const BASE = "/api/v1/accounting/related-party-loans";
const FACILITIES_BASE = "/api/v1/accounting/related-party-loan-facilities";

export function listRelatedPartyLoansUrl(q: ListRelatedPartyLoansQuery): string {
  const p = new URLSearchParams();
  p.set("operating_company_id", q.operating_company_id);
  if (q.direction) p.set("direction", q.direction);
  if (q.target_type) p.set("target_type", q.target_type);
  if (q.facility_id) p.set("facility_id", q.facility_id);
  if (q.counterparty_id) p.set("counterparty_id", q.counterparty_id);
  appendStatusList(p, "status", q.status);
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

export async function listRelatedPartyLoanFacilities(
  operatingCompanyId: string,
  signal?: AbortSignal,
): Promise<ListRelatedPartyLoanFacilitiesResponse> {
  const p = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<ListRelatedPartyLoanFacilitiesResponse>(`${FACILITIES_BASE}?${p.toString()}`, {
    method: "GET",
    signal,
  });
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

/** Rows come back under `loans` (live), or legacy `rows` / `items`; normalise once, here. */
export function loanRowsOf(res: ListRelatedPartyLoansResponse | undefined): RelatedPartyLoanRow[] {
  if (!res) return [];
  return res.loans ?? res.rows ?? res.items ?? [];
}
