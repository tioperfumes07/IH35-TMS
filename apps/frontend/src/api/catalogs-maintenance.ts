import { apiRequest } from "./client";

export type MaintenanceCatalogRow = {
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

export type MaintenanceCatalogListResponse = {
  rows: MaintenanceCatalogRow[];
  total: number;
};

export type MaintenanceCatalogCreateBody = {
  code: string;
  display_name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  sort_order?: number;
  is_active?: boolean;
};

export type MaintenanceCatalogUpdateBody = Partial<MaintenanceCatalogCreateBody>;

type ListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
};

export function createMaintenanceCatalogClient(urlSegment: string) {
  const basePath = `/api/v1/catalogs/maintenance/${urlSegment}`;

  return {
    list(filters: ListFilters) {
      const params = new URLSearchParams();
      params.set("operating_company_id", filters.operating_company_id);
      if (filters.search) params.set("search", filters.search);
      if (filters.is_active) params.set("is_active", filters.is_active);
      if (filters.limit !== undefined) params.set("limit", String(filters.limit));
      if (filters.offset !== undefined) params.set("offset", String(filters.offset));
      return apiRequest<MaintenanceCatalogListResponse>(`${basePath}?${params.toString()}`);
    },

    get(id: string, operating_company_id: string) {
      return apiRequest<MaintenanceCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`);
    },

    create(operating_company_id: string, body: MaintenanceCatalogCreateBody) {
      return apiRequest<MaintenanceCatalogRow>(`${basePath}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
        method: "POST",
        body,
      });
    },

    update(id: string, operating_company_id: string, body: MaintenanceCatalogUpdateBody) {
      return apiRequest<MaintenanceCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
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

export const maintenanceFailureCodesCatalogClient = createMaintenanceCatalogClient("failure-codes");
export const maintenanceLaborCodesCatalogClient = createMaintenanceCatalogClient("labor-codes");
export const maintenancePartsCatalogClient = createMaintenanceCatalogClient("parts");
export const maintenancePriorityLevelsCatalogClient = createMaintenanceCatalogClient("priority-levels");
export const maintenanceServiceTasksCatalogClient = createMaintenanceCatalogClient("service-tasks");
export const maintenanceShopLocationsCatalogClient = createMaintenanceCatalogClient("shop-locations");
export const maintenanceVendorsCatalogClient = createMaintenanceCatalogClient("vendors");
export const workOrderStatusesCatalogClient = createMaintenanceCatalogClient("work-order-statuses");
