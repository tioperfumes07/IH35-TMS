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

export type AggregatedQboW2Run = {
  qbo_payroll_run_id: string;
  qbo_payroll_run_name?: string | null;
  gross_cents?: number;
  net_cents?: number;
  employee_count?: number;
  sync_state?: string;
};

export type AggregatedPayrollResponse = {
  driver_settlements: AggregatedDriverSettlement[];
  qbo_w2_runs: AggregatedQboW2Run[];
  sync_state: string;
  last_synced_at: string | null;
  option: "B";
};

export function getAggregatedPayroll(operatingCompanyId: string) {
  return apiRequest<AggregatedPayrollResponse>(`/api/v1/payroll/aggregated?${q(operatingCompanyId)}`);
}

export function refreshAggregatedPayroll(operatingCompanyId: string) {
  return apiRequest<{ sync_state: string; refreshed_at: string | null; updated_rows: number }>(
    `/api/v1/payroll/aggregated/refresh?${q(operatingCompanyId)}`,
    { method: "POST" }
  );
}
