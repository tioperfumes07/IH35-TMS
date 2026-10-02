// Lead 2026-10-02 — a negative Faro Cash Reserve presents as Due to Faro (2156) at period end.
import { apiRequest } from "./client";

export type CashReserveReclassStatus = {
  period_end: string;
  register_bound: boolean;
  balance_cents: number | null;
  deficit_cents: number;
  reclass: { id: string; deficit_cents: number; journal_entry_id: string; reversal_journal_entry_id: string } | null;
  state: "no_deficit" | "due" | "reclassed" | "stale";
  complete: boolean;
};

export function getCashReserveReclass(companyId: string, period: string) {
  return apiRequest<CashReserveReclassStatus>(
    `/api/v1/factoring/cash-reserve-reclass?${new URLSearchParams({ operating_company_id: companyId, period })}`
  );
}

export function postCashReserveReclass(companyId: string, period: string) {
  return apiRequest<{ reclass_id: string; deficit_cents: number; journal_entry_id: string; reversal_journal_entry_id: string }>(
    `/api/v1/factoring/cash-reserve-reclass`,
    { method: "POST", body: { operating_company_id: companyId, period } }
  );
}
