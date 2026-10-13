import { apiRequest } from "./client";

function q(operatingCompanyId: string) {
  return new URLSearchParams({ operating_company_id: operatingCompanyId }).toString();
}

export type AggregatedDriverSettlement = {
  id: string;
  driver_id: string;
  pay_period_start?: string;
  pay_period_end?: string;
  gross_cents?: number;
  net_cents?: number;
  status?: string;
};

export type AggregatedPayrollResponse = {
  driver_settlements: AggregatedDriverSettlement[];
  option: "B";
};

export function getAggregatedPayroll(operatingCompanyId: string) {
  return apiRequest<AggregatedPayrollResponse>(`/api/v1/payroll/aggregated?${q(operatingCompanyId)}`);
}
