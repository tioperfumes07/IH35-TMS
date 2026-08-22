import { apiRequest } from "./client";

export type AccountingDriverReimbursementDetail = {
  id: string;
  driver_id: string;
  driver_name: string;
  load_id: string | null;
  load_number: string | null;
  reimbursement_type: string;
  amount_cents: string;
  reason: string;
  pay_mode: string;
  status: string;
  posting_date: string | null;
  paid_at: string | null;
  journal_entry_id: string | null;
  applied_to_settlement_id: string | null;
  settlement_number: string | null;
  evidence_doc_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  from_bank_account_id: string | null;
  bank_account_name: string | null;
  created_at: string;
  updated_at: string;
};

export function getAccountingDriverReimbursement(id: string, operatingCompanyId: string) {
  return apiRequest<AccountingDriverReimbursementDetail>(
    `/api/v1/accounting/driver-reimbursements/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
