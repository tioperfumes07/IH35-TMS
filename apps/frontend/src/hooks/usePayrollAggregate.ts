/**
 * CLOSURE-12 — hook for payroll aggregate API.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";

export type PayrollPerson = {
  person_id: string;
  person_name: string;
  pay_type: "1099" | "W2";
  class: "UNIT-DRIVER" | "OFFICE" | "OTHER";
  gross_cents: number;
  deductions_cents: number;
  net_cents: number;
};

export type PayrollClassAllocation = {
  class: "UNIT-DRIVER" | "OFFICE" | "OTHER";
  amount_cents: number;
  sources: string[];
};

export type PayrollAggregateResponse = {
  period_start: string;
  period_end: string;
  driver_total: number;
  w2_total: number;
  benefits: number;
  taxes: number;
  grand_total: number;
  by_class: PayrollClassAllocation[];
  by_person: PayrollPerson[];
  stale: boolean;
};

export function usePayrollAggregate(
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
) {
  return useQuery({
    queryKey: ["payroll-integration", "aggregate", operatingCompanyId, periodStart, periodEnd],
    queryFn: () =>
      apiRequest<PayrollAggregateResponse>(
        `/api/v1/payroll-integration/aggregate?operating_company_id=${encodeURIComponent(operatingCompanyId)}&period_start=${periodStart}&period_end=${periodEnd}`
      ),
    enabled: Boolean(operatingCompanyId && periodStart && periodEnd),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePayrollRefresh(operatingCompanyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodStart, periodEnd }: { periodStart: string; periodEnd: string }) =>
      apiRequest<{ status: string; refreshed_at: string }>(
        `/api/v1/payroll-integration/aggregate/refresh?operating_company_id=${encodeURIComponent(operatingCompanyId)}&period_start=${periodStart}&period_end=${periodEnd}`,
        { method: "POST" }
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payroll-integration"] }),
  });
}
