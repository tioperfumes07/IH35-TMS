import { apiRequest } from "./client";

export type CatalogAccount = {
  id: string;
  account_number: string | null;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  parent_account_id: string | null;
  qbo_account_id: string | null;
  qbo_account_qrn: string | null;
  is_postable: boolean;
  currency_code: string;
  opening_balance_cents: number | null;
  opening_balance_as_of: string | null;
  is_locked: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
};

export type CreateCatalogAccountBody = {
  account_name: string;
  account_type: string;
  account_number?: string | null;
  account_subtype?: string | null;
  parent_account_id?: string | null;
  is_postable?: boolean;
  currency_code?: string;
  opening_balance_cents?: number | null;
  opening_balance_as_of?: string | null;
  is_locked?: boolean;
  notes?: string | null;
  operating_company_id?: string;
};

export type UpdateCatalogAccountBody = Partial<CreateCatalogAccountBody> & {
  deactivated_at?: string | null;
};

export function createCatalogAccount(body: CreateCatalogAccountBody) {
  return apiRequest<CatalogAccount>("/api/v1/catalogs/accounts", {
    method: "POST",
    body,
  });
}

export function updateCatalogAccount(id: string, body: UpdateCatalogAccountBody) {
  return apiRequest<CatalogAccount>(`/api/v1/catalogs/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function deactivateCatalogAccountById(id: string) {
  return apiRequest<{ id: string; deactivated_at: string; was_already_deactivated: boolean }>(
    `/api/v1/catalogs/accounts/${encodeURIComponent(id)}/deactivate`,
    { method: "POST", body: {} }
  );
}

export function getCatalogAccount(id: string) {
  return apiRequest<CatalogAccount>(`/api/v1/catalogs/accounts/${encodeURIComponent(id)}`);
}

// Active chart of accounts (entity-scoped server-side). Used e.g. for the Record-Expense payment-account
// picker, where the caller filters to postable Asset (bank/cash) accounts.
export function listCatalogAccounts(params?: { status?: string; limit?: number }) {
  const qs = new URLSearchParams();
  qs.set("status", params?.status ?? "active");
  qs.set("limit", String(params?.limit ?? 300));
  return apiRequest<{ accounts: CatalogAccount[] }>(`/api/v1/catalogs/accounts?${qs.toString()}`);
}
