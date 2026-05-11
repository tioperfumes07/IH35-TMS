import { apiRequest } from "./client";

export type DispatchCatalogRow = {
  id: string;
  operating_company_id: string;
  code: string;
  display_name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DispatchCatalogListResponse = {
  rows: DispatchCatalogRow[];
  total: number;
};

export type DispatchCatalogListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
};

export type DispatchCatalogCreateBody = {
  code: string;
  display_name: string;
  description?: string | null;
  sort_order?: number;
  metadata?: Record<string, unknown>;
};

export type DispatchCatalogUpdateBody = Partial<DispatchCatalogCreateBody> & {
  is_active?: boolean;
};

function buildQuery(filters: DispatchCatalogListFilters) {
  const query = new URLSearchParams();
  query.set("operating_company_id", filters.operating_company_id);
  if (filters.search) query.set("search", filters.search);
  if (filters.is_active) query.set("is_active", filters.is_active);
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  return query.toString();
}

export function createDispatchCatalogClient(catalogPath: "load-types" | "detention-reasons" | "pickup-time-types" | "additional-charges") {
  const basePath = `/api/v1/catalogs/dispatch/${catalogPath}`;
  return {
    list: (filters: DispatchCatalogListFilters) =>
      apiRequest<DispatchCatalogListResponse>(`${basePath}?${buildQuery(filters)}`),
    get: (operatingCompanyId: string, id: string) =>
      apiRequest<DispatchCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    create: (operatingCompanyId: string, body: DispatchCatalogCreateBody) =>
      apiRequest<DispatchCatalogRow>(`${basePath}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "POST",
        body,
      }),
    update: (operatingCompanyId: string, id: string, body: DispatchCatalogUpdateBody) =>
      apiRequest<DispatchCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "PATCH",
        body,
      }),
    deactivate: (operatingCompanyId: string, id: string) =>
      apiRequest<DispatchCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "DELETE",
      }),
  };
}

export const loadTypesCatalogClient = createDispatchCatalogClient("load-types");
export const detentionReasonsCatalogClient = createDispatchCatalogClient("detention-reasons");
export const pickupTimeTypesCatalogClient = createDispatchCatalogClient("pickup-time-types");
export const additionalChargesCatalogClient = createDispatchCatalogClient("additional-charges");
