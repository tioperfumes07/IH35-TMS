import { apiRequest } from "./client";

// Per-entity Detail Type catalog (Block 4). System rows (is_system) are the canonical, immutable
// QBO seed shared by every entity; custom rows are this entity's own. Keyed to a global Account Type.
export type DetailTypeRow = {
  id: string;
  account_type_id: string;
  name: string;
  code: string | null;
  description: string | null;
  qbo_detail_type_name: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type DetailTypeCreateBody = {
  account_type_id: string;
  name: string;
  code?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
};

export type DetailTypeUpdateBody = Partial<Omit<DetailTypeCreateBody, "account_type_id">>;

const basePath = "/api/v1/catalogs/accounting/detail-types";

export const detailTypesCatalogClient = {
  list(filters: { operating_company_id: string; account_type_id?: string; search?: string; is_active?: "true" | "false" | "all"; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    params.set("operating_company_id", filters.operating_company_id);
    if (filters.account_type_id) params.set("account_type_id", filters.account_type_id);
    if (filters.search) params.set("search", filters.search);
    if (filters.is_active) params.set("is_active", filters.is_active);
    if (filters.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters.offset !== undefined) params.set("offset", String(filters.offset));
    return apiRequest<{ rows: DetailTypeRow[]; total: number }>(`${basePath}?${params.toString()}`);
  },
  create(operating_company_id: string, body: DetailTypeCreateBody) {
    return apiRequest<{ id: string }>(`${basePath}?operating_company_id=${encodeURIComponent(operating_company_id)}`, { method: "POST", body });
  },
  update(id: string, operating_company_id: string, body: DetailTypeUpdateBody) {
    return apiRequest<{ ok: true }>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, { method: "PATCH", body });
  },
  deactivate(id: string, operating_company_id: string) {
    return apiRequest<{ ok: true }>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, { method: "DELETE" });
  },
};
