import { apiRequest } from "./client";

export type UnexpectedKind =
  | "shop"
  | "tires"
  | "towing"
  | "fines"
  | "lumper"
  | "medical";

export type UnexpectedCandidate = {
  id: string;
  transaction_date: string;
  payee_display: string;
  kind: UnexpectedKind;
  kind_label: string;
  amount_cents: number;
  flag: string | null;
  is_duplicate: boolean;
  vendor_id: string | null;
  vendor_name: string | null;
  unit_id: string | null;
  unit_number: string | null;
  work_order_id: string | null;
  work_order_display_id: string | null;
};

export type UnexpectedByKindRow = {
  kind: UnexpectedKind;
  label: string;
  amount_cents: number | null;
  count: number;
};

export type UnexpectedExpensesReport = {
  operating_company_id: string;
  month: string;
  month_label: string;
  as_of_date: string;
  kpis: {
    month_total_cents: number;
    candidate_count: number;
    month_sub: string;
    duplicate_count: number;
    duplicate_amounts_cents: number[];
    linked_to_truck: number;
    tows_fines_cents: number;
    tows_fines_sub: string;
  };
  candidates: UnexpectedCandidate[];
  by_kind: UnexpectedByKindRow[];
};

export function getUnexpectedExpenses(companyId: string, asOfDate?: string) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (asOfDate) params.set("as_of_date", asOfDate);
  return apiRequest<UnexpectedExpensesReport>(
    `/api/v1/accounting/unexpected-expenses?${params.toString()}`
  );
}
