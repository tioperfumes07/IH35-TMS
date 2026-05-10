import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export type DriverVendorMergeRow = {
  id: string;
  driver_id: string;
  from_qbo_vendor_id: string;
  to_qbo_vendor_id: string;
  merge_reason: string;
  merged_by_user_id: string;
  merged_at: string;
};

export type FaroDailyImportRow = {
  id: string;
  statement_date: string;
  statement_reference: string;
  source_filename: string | null;
  gross_total_cents: number;
  advance_total_cents: number;
  reserve_total_cents: number;
  fee_total_cents: number;
  chargeback_total_cents: number;
  imported_at: string;
};

export type EquipmentLoanRow = {
  id: string;
  equipment_id: string;
  lender_vendor_id: string;
  principal_cents: number;
  apr_percent: number;
  started_on: string;
  maturity_on: string | null;
  status: "active" | "paid_off" | "defaulted" | "voided";
  equipment_number?: string;
  lender_vendor_name?: string;
};

export type EquipmentLoanLedger = {
  loan: EquipmentLoanRow;
  attributions: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
};

export function listDriverVendorMerges(companyId: string) {
  return apiRequest<{ rows: DriverVendorMergeRow[] }>(`/api/v1/integrations/qbo/driver-vendor-merges?${q(companyId)}`);
}

export function createDriverVendorMerge(payload: {
  operating_company_id: string;
  driver_id: string;
  from_qbo_vendor_id: string;
  to_qbo_vendor_id: string;
  reason: string;
  apply_to_driver: boolean;
}) {
  return apiRequest<{ ok: boolean; id: string }>(`/api/v1/integrations/qbo/driver-vendor-merges`, {
    method: "POST",
    body: payload,
  });
}

export function listFaroDailyImports(companyId: string) {
  return apiRequest<{ rows: FaroDailyImportRow[] }>(`/api/v1/factoring/faro-imports?${q(companyId)}`);
}

export function upsertFaroDailyImport(payload: {
  operating_company_id: string;
  statement_date: string;
  statement_reference: string;
  source_filename?: string;
  notes?: string;
  lines: Array<{
    invoice_number: string;
    customer_name?: string;
    load_id?: string;
    gross_amount_cents?: number;
    advance_amount_cents?: number;
    reserve_amount_cents?: number;
    fee_amount_cents?: number;
    chargeback_amount_cents?: number;
    net_amount_cents?: number;
    due_on?: string;
  }>;
}) {
  return apiRequest<{ ok: boolean; id: string }>(`/api/v1/factoring/faro-imports`, {
    method: "POST",
    body: payload,
  });
}

export function listEquipmentLoans(companyId: string) {
  return apiRequest<{ rows: EquipmentLoanRow[] }>(`/api/v1/banking/equipment-loans?${q(companyId)}`);
}

export function createEquipmentLoan(payload: {
  operating_company_id: string;
  equipment_id: string;
  lender_vendor_id: string;
  principal_cents: number;
  apr_percent: number;
  started_on: string;
  maturity_on?: string;
  memo?: string;
}) {
  return apiRequest<{ ok: boolean; id: string }>(`/api/v1/banking/equipment-loans`, {
    method: "POST",
    body: payload,
  });
}

export function getEquipmentLoanLedger(loanId: string, companyId: string) {
  return apiRequest<EquipmentLoanLedger>(`/api/v1/banking/equipment-loans/${loanId}/ledger?${q(companyId)}`);
}

export function createEquipmentLoanPayment(
  loanId: string,
  payload: {
    operating_company_id: string;
    paid_on: string;
    amount_cents: number;
    principal_cents: number;
    interest_cents: number;
    fee_cents: number;
    reference_number?: string;
    memo?: string;
  }
) {
  return apiRequest<{ ok: boolean; id: string }>(`/api/v1/banking/equipment-loans/${loanId}/payments`, {
    method: "POST",
    body: payload,
  });
}

export function createEquipmentLoanAttribution(
  loanId: string,
  payload: {
    operating_company_id: string;
    load_id: string;
    attribution_date: string;
    amount_cents: number;
    memo?: string;
  }
) {
  return apiRequest<{ ok: boolean; id: string }>(`/api/v1/banking/equipment-loans/${loanId}/attributions`, {
    method: "POST",
    body: payload,
  });
}
