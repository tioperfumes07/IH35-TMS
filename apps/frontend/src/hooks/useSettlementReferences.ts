import { useQuery } from "@tanstack/react-query";
import { getSettlementReferences } from "../api/driverFinance";

export function useSettlementReferences(companyId: string | null | undefined, loadIds: Array<string | null | undefined>) {
  const ids = [...new Set(loadIds.filter((id): id is string => Boolean(id)))].sort();
  const query = useQuery({
    queryKey: ["settlement-references", companyId, ids],
    queryFn: () => getSettlementReferences(companyId!, ids),
    enabled: Boolean(companyId && ids.length),
    staleTime: 30_000,
  });
  return new Map((query.data?.references ?? []).map((row) => [row.load_id, row]));
}
