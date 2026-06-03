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
};

export function useModuleCount(module: ListsModule) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["lists-module-count", MODULE_SLUG[module], companyId],
    queryFn: () => getListsModuleCount(MODULE_SLUG[module], companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  return {
    count: query.data?.count ?? 0,
    loading: query.isLoading,
    error: query.error ? String((query.error as Error).message || query.error) : null,
  };
}
