import { useQuery } from "@tanstack/react-query";
import { getLoadCostRollupBatch, type LoadCostRollup } from "../api/accounting";

/** LAW 5 / ROUND 153 — the canonical per-load revenue/costs/driver_pay/margin for a LIST of
 *  loads, one request. Same shape as useSettlementReferences — batch a list of load ids, return
 *  a Map keyed by load_id so a list/board view can look up each row's canonical numbers instead
 *  of re-deriving them (the exact LAW 5 defect fixed elsewhere in this round). */
export function useLoadCostRollups(companyId: string | null | undefined, loadIds: Array<string | null | undefined>) {
  const ids = [...new Set(loadIds.filter((id): id is string => Boolean(id)))].sort();
  const query = useQuery({
    queryKey: ["load-cost-rollups", companyId, ids],
    queryFn: () => getLoadCostRollupBatch(companyId!, ids),
    enabled: Boolean(companyId && ids.length),
    staleTime: 30_000,
  });
  return new Map<string, LoadCostRollup>((query.data?.rollups ?? []).map((row) => [row.load_id, row]));
}
