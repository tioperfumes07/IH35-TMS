import { apiRequest } from "./client";

export type CustomerContract = {
  id: string;
  customer_id: string;
  file_id: string | null;
  contract_type: "rate_agreement" | "master_service" | "broker_carrier" | "other";
  effective_date: string | null;
  expiration_date: string | null;
  notes: string | null;
  supersedes_id: string | null;
  uploaded_by_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  file_name: string | null;
  file_size_bytes: number | null;
  file_mime_type: string | null;
};

export function listCustomerContracts(
  customerId: string,
  operatingCompanyId: string,
  includeSuperseded = false
) {
  const qs = new URLSearchParams({
    customer_id: customerId,
    operating_company_id: operatingCompanyId,
    ...(includeSuperseded ? { include_superseded: "true" } : {}),
  });
  return apiRequest<{ contracts: CustomerContract[] }>(`/api/v1/customer-contracts?${qs}`);
}

export function createCustomerContract(payload: {
  operating_company_id: string;
  customer_id: string;
  file_id?: string;
  contract_type: CustomerContract["contract_type"];
  effective_date?: string | null;
  expiration_date?: string | null;
  notes?: string | null;
}) {
  return apiRequest<{ id: string }>("/api/v1/customer-contracts", {
    method: "POST",
    body: payload,
  });
}

export function supersedeCustomerContract(
  id: string,
  payload: {
    operating_company_id: string;
    file_id?: string;
    contract_type?: CustomerContract["contract_type"];
    effective_date?: string | null;
    expiration_date?: string | null;
    notes?: string | null;
  }
) {
  return apiRequest<{ id: string; superseded_id: string }>(
    `/api/v1/customer-contracts/${id}/supersede`,
    { method: "POST", body: payload }
  );
}
