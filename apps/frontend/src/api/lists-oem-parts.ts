import { apiRequest } from "./client";

export type OemPartRow = {
  id: string;
  brand: string;
  model_compat: string | null;
  oem_part_number: string | null;
  part_name: string;
  category: string;
  sub_category: string | null;
  description: string | null;
  unit_cost_usd_typical: string | null;
  default_supplier: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OemPartsListResponse = {
  rows: OemPartRow[];
  total_count: number;
  archived_count: number;
  brand_count: number;
  fleet_count: number;
  fleet_only: boolean;
};

export type OemPartsBrandRow = {
  brand: string;
  total_count: number;
  fleet_match: boolean;
};

export type OemPartsBrandsResponse = {
  rows: OemPartsBrandRow[];
  fleet_brands: string[];
  fleet_matched_brand_count: number;
};

export type OemPartCreateBody = {
  brand: string;
  model_compat?: string | null;
  oem_part_number?: string | null;
  part_name: string;
  category: string;
  sub_category?: string | null;
  description?: string | null;
  unit_cost_usd_typical?: number | null;
  default_supplier?: string | null;
};

type ListFilters = {
  brand?: string;
  category?: string;
  fleet_only?: boolean;
  q?: string;
  include_archived?: boolean;
};

const basePath = "/api/v1/lists/oem-parts";

export const oemPartsCatalogClient = {
  list(filters: ListFilters = {}) {
    const params = new URLSearchParams();
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.category) params.set("category", filters.category);
    if (filters.fleet_only === false) params.set("fleet_only", "false");
    if (filters.q) params.set("q", filters.q);
    if (filters.include_archived) params.set("include_archived", "true");
    const qs = params.toString();
    return apiRequest<OemPartsListResponse>(qs ? `${basePath}?${qs}` : basePath);
  },

  brands() {
    return apiRequest<OemPartsBrandsResponse>(`${basePath}/brands`);
  },

  create(body: OemPartCreateBody) {
    return apiRequest<OemPartRow>(basePath, {
      method: "POST",
      body,
    });
  },

  update(id: string, body: Partial<OemPartCreateBody>) {
    return apiRequest<OemPartRow>(`${basePath}/${id}`, {
      method: "PATCH",
      body,
    });
  },

  archive(id: string) {
    return apiRequest<OemPartRow>(`${basePath}/${id}/archive`, {
      method: "POST",
    });
  },

  restore(id: string) {
    return apiRequest<OemPartRow>(`${basePath}/${id}/restore`, {
      method: "POST",
    });
  },
};

export const OEM_PART_CATEGORIES = [
  "filters",
  "brakes",
  "electrical",
  "fluids",
  "engine",
  "reefer",
  "suspension",
  "tires",
] as const;
