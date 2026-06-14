import { apiRequest } from "./client";

export type AccountingCatalogRow = {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AccountingCatalogListResponse = {
  rows: AccountingCatalogRow[];
  total: number;
};

export type AccountingCatalogCreateBody = {
  code: string;
  display_name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  sort_order?: number;
};

export type AccountingCatalogUpdateBody = Partial<AccountingCatalogCreateBody>;

type ListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
};

export function createAccountingCatalogClient(urlSegment: string) {
  const basePath = `/api/v1/catalogs/accounting/${urlSegment}`;
  return {
    list(filters: ListFilters) {
      const params = new URLSearchParams();
      params.set("operating_company_id", filters.operating_company_id);
      if (filters.search) params.set("search", filters.search);
      if (filters.is_active) params.set("is_active", filters.is_active);
      if (filters.limit !== undefined) params.set("limit", String(filters.limit));
      if (filters.offset !== undefined) params.set("offset", String(filters.offset));
      return apiRequest<AccountingCatalogListResponse>(`${basePath}?${params.toString()}`);
    },

    get(id: string, operating_company_id: string) {
      return apiRequest<AccountingCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`);
    },

    create(operating_company_id: string, body: AccountingCatalogCreateBody) {
      return apiRequest<{ id: string }>(`${basePath}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
        method: "POST",
        body,
      });
    },

    update(id: string, operating_company_id: string, body: AccountingCatalogUpdateBody) {
      return apiRequest<{ id: string }>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
        method: "PATCH",
        body,
      });
    },

    deactivate(id: string, operating_company_id: string) {
      return apiRequest<{ ok: true }>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
        method: "DELETE",
      });
    },
  };
}

export const chartOfAccountsCatalogClient = createAccountingCatalogClient("chart-of-accounts");
export const classesCatalogClient = createAccountingCatalogClient("classes");
export const paymentTermsCatalogClient = createAccountingCatalogClient("payment-terms");
export const postingTemplatesCatalogClient = createAccountingCatalogClient("posting-templates");
export const journalEntryTypesCatalogClient = createAccountingCatalogClient("journal-entry-types");
export const qboCategoriesCatalogClient = createAccountingCatalogClient("qbo-categories");
export const itemsCatalogClient = createAccountingCatalogClient("items");
export const accountRoleBindingsCatalogClient = createAccountingCatalogClient("account-role-bindings");
export const chartOfAccountsSeedsCatalogClient = createAccountingCatalogClient("chart-of-accounts-seeds");
export const expenseCategoriesCatalogClient = createAccountingCatalogClient("expense-categories");
export const paymentMethodsCatalogClient = createAccountingCatalogClient("payment-methods");
export const taxCodesCatalogClient = createAccountingCatalogClient("tax-codes");
export const currencyCodesCatalogClient = createAccountingCatalogClient("currency-codes");

// Block 7 — bulk edit for Classes (deactivate / re-parent selected).
export function bulkUpdateClasses(payload: {
  op: "deactivate" | "reparent";
  ids: string[];
  parent_class_id?: string | null;
}) {
  return apiRequest<{ updated: number }>("/api/v1/catalogs/classes/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
