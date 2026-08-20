import { apiRequest } from "./client";

// LST-WIRE-07-CUSTOMER-TYPES-CATALOG-NO-CONSUMER — catalogs.customer_types (migration
// 202610150000) had a working generic-catalog backend route but no frontend client at all. Mirrors
// the createDispatchCatalogClient / createDriverCatalogClient factory pattern already used for
// every other generic-catalog domain.
export type CustomersCatalogRow = {
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

export type CustomersCatalogListResponse = {
  rows: CustomersCatalogRow[];
  total: number;
};

export type CustomersCatalogListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
};

export type CustomersCatalogCreateBody = {
  code: string;
  display_name: string;
  description?: string | null;
  sort_order?: number;
  metadata?: Record<string, unknown>;
};

export type CustomersCatalogUpdateBody = Partial<CustomersCatalogCreateBody> & {
  is_active?: boolean;
};

function buildQuery(filters: CustomersCatalogListFilters) {
  const query = new URLSearchParams();
  query.set("operating_company_id", filters.operating_company_id);
  if (filters.search) query.set("search", filters.search);
  if (filters.is_active) query.set("is_active", filters.is_active);
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  return query.toString();
}

export function createCustomersCatalogClient(catalogPath: "customer-types") {
  const basePath = `/api/v1/catalogs/customers/${catalogPath}`;
  return {
    list: (filters: CustomersCatalogListFilters) =>
      apiRequest<CustomersCatalogListResponse>(`${basePath}?${buildQuery(filters)}`),
    get: (operatingCompanyId: string, id: string) =>
      apiRequest<CustomersCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    create: (operatingCompanyId: string, body: CustomersCatalogCreateBody) =>
      apiRequest<CustomersCatalogRow>(`${basePath}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "POST",
        body,
      }),
    update: (operatingCompanyId: string, id: string, body: CustomersCatalogUpdateBody) =>
      apiRequest<CustomersCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "PATCH",
        body,
      }),
    deactivate: (operatingCompanyId: string, id: string) =>
      apiRequest<CustomersCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "DELETE",
      }),
  };
}

export const customerTypesCatalogClient = createCustomersCatalogClient("customer-types");
