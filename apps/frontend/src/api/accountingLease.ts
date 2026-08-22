import { apiRequest } from "./client";

export type AccountingLeaseContract = {
  id: string;
  display_id: string | null;
  election: string;
  status: string;
  commencement_date: string;
  end_date: string;
  payment_amount_cents: string;
  payment_frequency: string;
  number_of_periods: number;
  total_lease_payments_cents: string;
  commencement_je_id: string | null;
};

export type AccountingLeaseAsset = {
  id: string;
  fixed_asset_id: string;
  unit_uuid: string | null;
  allocated_cost_cents: string;
  asset_number: string | null;
  fixed_asset_name: string | null;
  unit_number: string | null;
};

export type AccountingLeaseScheduleRow = {
  period_number: number;
  period_date: string;
  payment_cents: string;
  rental_income_cents: string;
  interest_cents: string;
  principal_cents: string;
  receivable_balance_cents: string;
  posted: boolean;
  posted_journal_entry_id: string | null;
};

export type AccountingLeaseDetail = {
  contract: AccountingLeaseContract;
  assets: AccountingLeaseAsset[];
  schedule: AccountingLeaseScheduleRow[];
};

export function getAccountingLeaseDetail(id: string, operatingCompanyId: string) {
  return apiRequest<AccountingLeaseDetail>(
    `/api/v1/accounting/lease-posting/leases/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
