/**
 * CLOSURE-11 — hook for maintenance services catalog + ETA.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../api/client";

export type MaintenanceService = {
  id: string;
  service_code: string;
  service_name: string;
  service_category: string;
  applies_to_type: "truck" | "trailer" | "reefer" | "all";
  interval_miles: number | null;
  interval_months: number | null;
  interval_hours: number | null;
  is_safety_critical: boolean;
  typical_cost_cents: number;
  compliance_ref: string | null;
  is_active: boolean;
};

export type ServiceEta = {
  service_code: string;
  service_name: string;
  applies_to_type: string;
  is_safety_critical: boolean;
  eta: {
    dueAtMiles: number | null;
    dueAtDate: string | null;
    daysUntilDue: number | null;
    milesUntilDue: number | null;
    status: "ok" | "soon" | "overdue";
  };
};

export function useMaintenanceServicesCatalog(
  operatingCompanyId: string,
  options?: { search?: string; applies_to?: string; category?: string; page?: number }
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (options?.search) params.set("search", options.search);
  if (options?.applies_to) params.set("applies_to", options.applies_to);
  if (options?.category) params.set("category", options.category);
  if (options?.page) params.set("page", String(options.page));

  return useQuery({
    queryKey: ["catalogs", "maintenance", "services-catalog", operatingCompanyId, options],
    queryFn: () => apiRequest<{ rows: MaintenanceService[]; total: number; page: number }>(
      `/api/v1/catalogs/maintenance/services-catalog?${params.toString()}`
    ),
    enabled: Boolean(operatingCompanyId),
  });
}

export function useUnitServiceEtas(operatingCompanyId: string, unitId: string) {
  return useQuery({
    queryKey: ["maintenance", "services", "eta", operatingCompanyId, unitId],
    queryFn: () => apiRequest<ServiceEta[]>(
      `/api/v1/maintenance/services/eta?operating_company_id=${encodeURIComponent(operatingCompanyId)}&unit_id=${encodeURIComponent(unitId)}`
    ),
    enabled: Boolean(operatingCompanyId && unitId),
    staleTime: 5 * 60 * 1000,
  });
}
