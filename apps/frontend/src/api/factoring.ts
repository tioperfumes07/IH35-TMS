import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

function query(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    qs.set(key, value);
  }
  return qs.toString();
}

export type FactoringSummary = {
  operating_company_id: string;
  active_factor_id: string | null;
  active_factor_name: string;
  recourse_days: number;
  reserve_balance: number;
  chargeback_balance: number;
  last_advance_at: string | null;
  active_factor_count: number;
  single_factor_invariant_ok: boolean;
  mtd_advances_count: number;
  mtd_advanced_total: number;
};

export type FactoringRecourseInvoice = {
  factoring_advance_id: string;
  operating_company_id: string;
  active_factor_name: string | null;
  invoice_reference: string;
  customer_name: string;
  invoice_amount: number;
  advance_amount: number;
  reserve_amount: number;
  factored_at: string;
  recourse_expiry_date: string;
  days_until_recourse_expiry: number;
};

export type FactoringChargebackFeeRow = {
  factoring_advance_id: string;
  operating_company_id: string;
  created_at: string;
  statement_month: string | null;
  chargeback_amount: number;
  factor_fee_amount: number;
  statement_reference: string | null;
};

export type FactoringMonthlyFeeSummary = {
  statement_month: string | null;
  chargeback_total: number;
  factor_fee_total: number;
};

export type FactoringSettingsRow = {
  operating_company_id: string;
  active_factor_id: string | null;
  active_factor_name: string;
  recourse_days: number;
  active_factor_count: number;
  single_factor_invariant_ok: boolean;
  statement_month?: string | null;
  month_chargebacks_total?: number;
  month_factor_fees_total?: number;
};

export type FactoringBatchStatus = "draft" | "submitted" | "funded" | "rejected";

export type FactoringBatch = {
  id: string;
  tenant_id: string;
  batch_number: string;
  status: FactoringBatchStatus;
  invoice_ids: string[];
  total_face_cents: number;
  advance_rate: number;
  expected_advance_cents: number;
  fee_rate: number;
  expected_fee_cents: number;
  submitted_at: string | null;
  funded_at: string | null;
  factor_id: string | null;
};

export type FactoringBatchInvoice = {
  id: string;
  display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  total_cents: number;
};

export type FactoringReserveMovementDirection = "credit" | "debit";

export type FactoringReserveMovement = {
  id: string;
  tenant_id: string;
  batch_id: string | null;
  factor_id: string | null;
  direction: FactoringReserveMovementDirection;
  amount_cents: number;
  reason: string;
  created_at: string;
};

export function getFactoringSummary(companyId: string) {
  return apiRequest<FactoringSummary>(`/api/v1/factoring/summary?${q(companyId)}`);
}

export function getFactoringRecoursePipeline(companyId: string, limit = 200) {
  return apiRequest<{ invoices: FactoringRecourseInvoice[] }>(`/api/v1/factoring/recourse-pipeline?${q(companyId)}&limit=${limit}`);
}

export function getFactoringChargebacksFees(companyId: string) {
  return apiRequest<{ history: FactoringChargebackFeeRow[]; monthly_summary: FactoringMonthlyFeeSummary[] }>(
    `/api/v1/factoring/chargebacks-fees?${q(companyId)}`
  );
}

export function getFactoringStatementsSettings(companyId: string) {
  return apiRequest<{ current: FactoringSettingsRow; statements: FactoringSettingsRow[] }>(
    `/api/v1/factoring/statements-settings?${q(companyId)}`
  );
}

export function deactivateFactoring(companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/factoring/deactivate`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function listFactoringBatchCandidateInvoices(companyId: string) {
  return apiRequest<{ invoices: FactoringBatchInvoice[] }>(`/api/v1/factoring/batches/candidate-invoices?${q(companyId)}`);
}

export function listFactoringBatches(companyId: string, status?: FactoringBatchStatus) {
  return apiRequest<{ batches: FactoringBatch[] }>(`/api/v1/factoring/batches?${query({ operating_company_id: companyId, status })}`);
}

export function createFactoringBatchDraft(companyId: string, invoiceIds: string[]) {
  return apiRequest<FactoringBatch>("/api/v1/factoring/batches", {
    method: "POST",
    body: {
      operating_company_id: companyId,
      invoice_ids: invoiceIds,
    },
  });
}

export function submitFactoringBatch(batchId: string, companyId: string) {
  return apiRequest<FactoringBatch>(`/api/v1/factoring/batches/${encodeURIComponent(batchId)}/submit?${q(companyId)}`, {
    method: "POST",
    body: {},
  });
}

export function getFactoringBatchDetail(batchId: string, companyId: string) {
  return apiRequest<{ batch: FactoringBatch; invoices: FactoringBatchInvoice[] }>(
    `/api/v1/factoring/batches/${encodeURIComponent(batchId)}?${q(companyId)}`
  );
}

export function getReserveMovements(batchId: string, companyId: string) {
  return apiRequest<{ movements: FactoringReserveMovement[] }>(
    `/api/v1/factoring/batches/${encodeURIComponent(batchId)}/reserve-movements?${q(companyId)}`
  );
}

export type Factor = {
  id: string;
  tenant_id: string;
  name: string;
  advance_rate: number;
  fee_rate: number;
  reserve_rate: number;
  recourse_days: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerFactorAssignment = {
  id: string;
  tenant_id: string;
  customer_id: string;
  factor_id: string;
  factor_name: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export type FactorBatchHistoryRow = {
  id: string;
  batch_number: string;
  status: string;
  submitted_at: string | null;
  funded_at: string | null;
  total_face_cents: number;
  expected_advance_cents: number;
  expected_fee_cents: number;
};

export function listFactors(companyId: string, options: { active_only?: boolean } = {}) {
  return apiRequest<{ factors: Factor[] }>(
    `/api/v1/factoring/factors?${query({ operating_company_id: companyId, active_only: options.active_only ? "true" : undefined })}`
  );
}

export function createFactor(
  companyId: string,
  body: {
    name: string;
    advance_rate: number;
    fee_rate: number;
    reserve_rate: number;
    recourse_days: number;
    active?: boolean;
  }
) {
  return apiRequest<Factor>("/api/v1/factoring/factors", {
    method: "POST",
    body: {
      operating_company_id: companyId,
      ...body,
    },
  });
}

export function updateFactor(
  factorId: string,
  companyId: string,
  body: Partial<{
    name: string;
    advance_rate: number;
    fee_rate: number;
    reserve_rate: number;
    recourse_days: number;
    active: boolean;
  }>
) {
  return apiRequest<Factor>(`/api/v1/factoring/factors/${encodeURIComponent(factorId)}`, {
    method: "PATCH",
    body: {
      operating_company_id: companyId,
      ...body,
    },
  });
}

export function deactivateFactor(factorId: string, companyId: string) {
  return apiRequest<Factor>(`/api/v1/factoring/factors/${encodeURIComponent(factorId)}?${q(companyId)}`, {
    method: "DELETE",
  });
}

export function getCustomerFactor(customerId: string, companyId: string, asOfDate?: string) {
  const qs = query({
    operating_company_id: companyId,
    as_of_date: asOfDate,
  });
  return apiRequest<{
    factor: (Factor & { assignment_id: string; effective_from: string; effective_to: string | null }) | null;
    assignments: CustomerFactorAssignment[];
    batches: FactorBatchHistoryRow[];
    as_of_date: string;
  }>(`/api/v1/customers/${encodeURIComponent(customerId)}/factor?${qs}`);
}

export function assignCustomerFactor(
  customerId: string,
  companyId: string,
  body: {
    factor_id: string;
    effective_from: string;
  }
) {
  return apiRequest<CustomerFactorAssignment>(`/api/v1/customers/${encodeURIComponent(customerId)}/factor`, {
    method: "POST",
    body: {
      operating_company_id: companyId,
      ...body,
    },
  });
}
