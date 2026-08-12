import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../contexts/CompanyContext";
import { getListsModuleCount, type ListsModule } from "../api/listsHub";

const MODULE_SLUG: Record<ListsModule, string> = {
  SAFETY: "safety",
  DISPATCH: "dispatch",
  DRIVERS: "drivers",
  MAINTENANCE: "maintenance",
  FUEL: "fuel",
  FLEET: "fleet",
  ACCOUNTING: "accounting",
  NAMES_MASTER: "names_master",
  CUSTOMERS: "customers",
  VENDORS: "vendors",
  REFERENCE: "reference",
};

export function useModuleCount(module: ListsModule | undefined) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["lists-module-count", module ? MODULE_SLUG[module] : "unmapped", companyId],
    queryFn: () => getListsModuleCount(MODULE_SLUG[module!], companyId),
    enabled: Boolean(companyId && module),
    staleTime: 60_000,
  });

  return {
    // No response is not a measured zero. Callers render unavailable chrome until data exists.
    count: query.data?.count,
    loading: query.isLoading,
    error: query.error ? String((query.error as Error).message || query.error) : null,
    // A DEGRADED count is not a wrong count — it is a PARTIAL one, and the difference has to reach
    // the operator. Without this the badge shows an authoritative-looking number that silently omits
    // whole tables.
    degraded: Boolean(query.data?.degraded),
    missingTables: query.data?.missing_tables ?? [],
  };
}
