import { apiRequest } from "./client";

export type DriversReferenceCatalogRow = {
  id: string;
  code: string;
  label: string;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DriversReferenceCatalogListResponse = {
  rows: DriversReferenceCatalogRow[];
  total_count: number;
  archived_count: number;
};

export type DriversReferenceCatalogCreateBody = {
  code: string;
  label: string;
  sort_order?: number;
};

type ListFilters = {
  search?: string;
  include_archived?: boolean;
};

export function createDriversReferenceCatalogClient(urlSegment: string) {
  const basePath = `/api/v1/lists/drivers/${urlSegment}`;

  return {
    list(filters: ListFilters = {}) {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.include_archived) params.set("include_archived", "true");
      const qs = params.toString();
      return apiRequest<DriversReferenceCatalogListResponse>(qs ? `${basePath}?${qs}` : basePath);
    },

    create(body: DriversReferenceCatalogCreateBody) {
      return apiRequest<DriversReferenceCatalogRow>(basePath, {
        method: "POST",
        body,
      });
    },

    archive(id: string) {
      return apiRequest<DriversReferenceCatalogRow>(`${basePath}/${id}/archive`, {
        method: "POST",
      });
    },

    restore(id: string) {
      return apiRequest<DriversReferenceCatalogRow>(`${basePath}/${id}/restore`, {
        method: "POST",
      });
    },
  };
}

export const licenseClassesCatalogClient = createDriversReferenceCatalogClient("license-classes");
export const cdlEndorsementsCatalogClient = createDriversReferenceCatalogClient("endorsements");
export const cdlRestrictionsCatalogClient = createDriversReferenceCatalogClient("restrictions");
export const medicalCardStatusCatalogClient = createDriversReferenceCatalogClient("medical-card-status");
export const employmentStatusCatalogClient = createDriversReferenceCatalogClient("employment-status");

export const DRIVERS_REFERENCE_CATALOG_CLIENTS = {
  "license-classes": licenseClassesCatalogClient,
  endorsements: cdlEndorsementsCatalogClient,
  restrictions: cdlRestrictionsCatalogClient,
  "medical-card-status": medicalCardStatusCatalogClient,
  "employment-status": employmentStatusCatalogClient,
} as const;

export const DRIVERS_REFERENCE_API_SEGMENTS = [
  "license-classes",
  "endorsements",
  "restrictions",
  "medical-card-status",
  "employment-status",
] as const;
