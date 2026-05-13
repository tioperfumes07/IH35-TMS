import { apiRequest } from "./client";

export type FleetCatalogRow = {
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

export type FleetCatalogListResponse = {
  rows: FleetCatalogRow[];
  total: number;
};

export type FleetCatalogCreateBody = {
  code: string;
  display_name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  sort_order?: number;
  is_active?: boolean;
};

export type FleetCatalogUpdateBody = Partial<FleetCatalogCreateBody>;

type ListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
};

export function createFleetCatalogClient(urlSegment: string) {
  const basePath = `/api/v1/catalogs/fleet/${urlSegment}`;

  return {
    list(filters: ListFilters) {
      const params = new URLSearchParams();
      params.set("operating_company_id", filters.operating_company_id);
      if (filters.search) params.set("search", filters.search);
      if (filters.is_active) params.set("is_active", filters.is_active);
      if (filters.limit !== undefined) params.set("limit", String(filters.limit));
      if (filters.offset !== undefined) params.set("offset", String(filters.offset));
      return apiRequest<FleetCatalogListResponse>(`${basePath}?${params.toString()}`);
    },

    get(id: string, operating_company_id: string) {
      return apiRequest<FleetCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`);
    },

    create(operating_company_id: string, body: FleetCatalogCreateBody) {
      return apiRequest<FleetCatalogRow>(`${basePath}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
        method: "POST",
        body,
      });
    },

    update(id: string, operating_company_id: string, body: FleetCatalogUpdateBody) {
      return apiRequest<FleetCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
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

export const tractorStatusesCatalogClient = createFleetCatalogClient("tractor-statuses");
export const trailerStatusesCatalogClient = createFleetCatalogClient("trailer-statuses");
export const conditionCodesCatalogClient = createFleetCatalogClient("condition-codes");
export const equipmentTypesFleetCatalogClient = createFleetCatalogClient("equipment-types");
export const tirePositionsCatalogClient = createFleetCatalogClient("tire-positions");
export const ownershipTypesCatalogClient = createFleetCatalogClient("ownership-types");
export const trailerTypesCatalogClient = createFleetCatalogClient("trailer-types");
export const leaseTermsCatalogClient = createFleetCatalogClient("lease-terms");
export const assetStatusesCatalogClient = createFleetCatalogClient("asset-statuses");
export const assetLocationsCatalogClient = createFleetCatalogClient("asset-locations");
