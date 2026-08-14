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
  // LINK-F5171/LINK-F5183: resolved from from_qbo_vendor_id/to_qbo_vendor_id via
  // mdata.vendors.qbo_vendor_id -- null when no internal vendor matches that QBO id.
  from_vendor_id?: string | null;
  from_vendor_name?: string | null;
  to_vendor_id?: string | null;
  to_vendor_name?: string | null;
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
  // LIABILITY column-wave: principal minus payments applied to principal. OPTIONAL — the FE
  // (FactoringHome) falls back to principal_cents until the backend serializes it; serializer
  // gap filed to the money lane. Making it required before the API emits it would be dishonest.
  outstanding_balance_cents?: number;
};

export type EquipmentLoanLedger = {
  loan: EquipmentLoanRow;
  attributions: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
};

export function listDriverVendorMerges(companyId: string, filters: { driver_id?: string; vendor_id?: string } = {}) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (filters.driver_id) params.set("driver_id", filters.driver_id);
  if (filters.vendor_id) params.set("vendor_id", filters.vendor_id);
  return apiRequest<{ rows: DriverVendorMergeRow[] }>(`/api/v1/integrations/qbo/driver-vendor-merges?${params.toString()}`);
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

export function listEquipmentLoans(companyId: string, vendorId?: string) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (vendorId) params.set("vendor_id", vendorId);
  return apiRequest<{ rows: EquipmentLoanRow[] }>(`/api/v1/banking/equipment-loans?${params.toString()}`);
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
