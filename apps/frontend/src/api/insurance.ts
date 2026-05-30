import { apiRequest } from "./client";

export type CoiRequestStatus = "pending" | "sent" | "received" | "expired" | "dismissed";
export type PaymentScheduleStatus = "scheduled" | "reminded" | "paid" | "overdue" | "late_fee_applied";

export type InsuranceCoiRequest = {
  id: string;
  tenant_id: string;
  customer_id: string;
  policy_id: string | null;
  requested_at: string;
  requested_by: string | null;
  status: CoiRequestStatus;
  notes: string | null;
  document_url: string | null;
  expires_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCoiRequestPayload = {
  operating_company_id: string;
  customer_id: string;
  policy_id?: string | null;
  notes?: string | null;
  expires_at?: string | null;
};

export type UpdateCoiRequestPayload = {
  status?: CoiRequestStatus;
  notes?: string | null;
  document_url?: string | null;
  expires_at?: string | null;
  responded_at?: string | null;
  policy_id?: string | null;
};

export function listInsuranceCoiRequests(params: {
  operating_company_id: string;
  customer_id?: string;
  status?: CoiRequestStatus;
}) {
  const qs = new URLSearchParams();
  qs.set("operating_company_id", params.operating_company_id);
  if (params.customer_id) qs.set("customer_id", params.customer_id);
  if (params.status) qs.set("status", params.status);
  return apiRequest<{ requests: InsuranceCoiRequest[] }>(`/api/v1/insurance/coi-requests?${qs.toString()}`);
}

export function createInsuranceCoiRequest(payload: CreateCoiRequestPayload) {
  return apiRequest<InsuranceCoiRequest>("/api/v1/insurance/coi-requests", {
    method: "POST",
    body: payload,
  });
}

export function updateInsuranceCoiRequest(
  id: string,
  operatingCompanyId: string,
  payload: UpdateCoiRequestPayload
) {
  const qs = new URLSearchParams();
  qs.set("operating_company_id", operatingCompanyId);
  return apiRequest<InsuranceCoiRequest>(`/api/v1/insurance/coi-requests/${id}?${qs.toString()}`, {
    method: "PATCH",
    body: payload,
  });
}

export type InsurancePaymentSchedule = {
  id: string;
  tenant_id: string;
  policy_id: string;
  due_date: string;
  amount_cents: number;
  status: PaymentScheduleStatus;
  reminded_at: string | null;
  paid_at: string | null;
  late_fee_cents: number;
  created_at: string;
  updated_at: string;
};

export type CreateInsurancePaymentSchedulePayload = {
  operating_company_id: string;
  policy_id: string;
  due_date: string;
  amount_cents: number;
  status?: PaymentScheduleStatus;
};

export function listInsurancePaymentSchedule(params: {
  operating_company_id: string;
  policy_id?: string;
  status?: PaymentScheduleStatus;
}) {
  const qs = new URLSearchParams();
  qs.set("operating_company_id", params.operating_company_id);
  if (params.policy_id) qs.set("policy_id", params.policy_id);
  if (params.status) qs.set("status", params.status);
  return apiRequest<{ payment_schedules: InsurancePaymentSchedule[] }>(
    `/api/v1/insurance/payment-schedule?${qs.toString()}`
  );
}

export function createInsurancePaymentSchedule(payload: CreateInsurancePaymentSchedulePayload) {
  return apiRequest<InsurancePaymentSchedule>("/api/v1/insurance/payment-schedule", {
    method: "POST",
    body: payload,
  });
}

export function markInsurancePaymentSchedulePaid(id: string, operatingCompanyId: string) {
  const qs = new URLSearchParams();
  qs.set("operating_company_id", operatingCompanyId);
  return apiRequest<InsurancePaymentSchedule>(`/api/v1/insurance/payment-schedule/${id}?${qs.toString()}`, {
    method: "PATCH",
    body: {},
  });
}
