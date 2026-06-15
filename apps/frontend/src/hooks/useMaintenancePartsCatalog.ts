/**
 * CLOSURE-10 — hook for enhanced mdata.maintenance_parts master catalog.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";

export type MaintPartRow = {
  id: string;
  sku: string;
  part_name: string;
  manufacturer: string;
  model_compatibility: string[];
  category: string;
  sub_category: string | null;
  typical_unit_cost_cents: number;
  barcode_upc: string | null;
  is_active: boolean;
  created_at: string;
};

export type MaintPartsListResponse = {
  rows: MaintPartRow[];
  total: number;
  page: number;
  limit: number;
};

export type MaintPartsFilters = {
  operating_company_id: string;
  search?: string;
  manufacturer?: string;
  category?: string;
  page?: number;
  limit?: number;
};

export function useMaintenancePartsCatalog(filters: MaintPartsFilters) {
  const params = new URLSearchParams({ operating_company_id: filters.operating_company_id });
  if (filters.search) params.set("search", filters.search);
  if (filters.manufacturer) params.set("manufacturer", filters.manufacturer);
  if (filters.category) params.set("category", filters.category);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  return useQuery({
    queryKey: ["catalogs", "maintenance", "parts-master", filters],
    queryFn: () => apiRequest<MaintPartsListResponse>(`/api/v1/catalogs/maintenance/parts-master?${params.toString()}`),
    enabled: Boolean(filters.operating_company_id),
  });
}

export function useCreateMaintPart(_operatingCompanyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<MaintPartRow, "id" | "created_at"> & { operating_company_id: string }) =>
      apiRequest<MaintPartRow>("/api/v1/catalogs/maintenance/parts-master", {
        method: "POST",
        body,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["catalogs", "maintenance", "parts-master"] }),
  });
}
