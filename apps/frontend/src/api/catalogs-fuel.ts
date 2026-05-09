import { apiRequest } from "./client";

export type FuelCatalogRow = {
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

export type FuelCatalogListResponse = {
  rows: FuelCatalogRow[];
  total: number;
};

export type FuelCatalogCreateBody = {
  code: string;
  display_name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  sort_order?: number;
  is_active?: boolean;
};

export type FuelCatalogUpdateBody = Partial<FuelCatalogCreateBody>;

type ListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
};

export function createFuelCatalogClient(urlSegment: string) {
  const basePath = `/api/v1/catalogs/fuel/${urlSegment}`;

  return {
    list(filters: ListFilters) {
      const params = new URLSearchParams();
      params.set("operating_company_id", filters.operating_company_id);
      if (filters.search) params.set("search", filters.search);
      if (filters.is_active) params.set("is_active", filters.is_active);
      if (filters.limit !== undefined) params.set("limit", String(filters.limit));
      if (filters.offset !== undefined) params.set("offset", String(filters.offset));
      return apiRequest<FuelCatalogListResponse>(`${basePath}?${params.toString()}`);
    },

    get(id: string, operating_company_id: string) {
      return apiRequest<FuelCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`);
    },

    create(operating_company_id: string, body: FuelCatalogCreateBody) {
      return apiRequest<FuelCatalogRow>(`${basePath}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
        method: "POST",
        body,
      });
    },

    update(id: string, operating_company_id: string, body: FuelCatalogUpdateBody) {
      return apiRequest<FuelCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
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

export const fuelCardTypesCatalogClient = createFuelCatalogClient("card-types");
export const fuelExceptionTypesCatalogClient = createFuelCatalogClient("exception-types");
export const fuelStationBrandsCatalogClient = createFuelCatalogClient("station-brands");
export const fuelStopReasonCodesCatalogClient = createFuelCatalogClient("stop-reason-codes");
export const mpgBandsCatalogClient = createFuelCatalogClient("mpg-bands");
export const expensiveStatesCatalogClient = createFuelCatalogClient("expensive-states");
export const fuelTaxJurisdictionsCatalogClient = createFuelCatalogClient("tax-jurisdictions");
