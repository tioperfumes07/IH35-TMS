import { useMutation, useQuery } from "@tanstack/react-query";
import { createInvoiceFromLoad } from "../api/accounting";
import { listLoads, type DispatchLoadRow, type LoadStatus } from "../api/loads";

export type LoadStatusFilter = "all" | "delivered" | "in_transit";

export function useInvoiceCreateFromLoad(operatingCompanyId: string, options: { search?: string; statusFilter?: LoadStatusFilter | readonly LoadStatusFilter[]; page?: number; pageSize?: number }) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;
  const offset = (page - 1) * pageSize;

  // U12 (owner UI register 2026-10-03) — the status filter is a multi-select; none / "all" = every status.
  const picked = (Array.isArray(options.statusFilter) ? options.statusFilter : options.statusFilter ? [options.statusFilter] : []).filter(
    (f): f is Exclude<LoadStatusFilter, "all"> => f !== "all"
  );
  const status: LoadStatus[] | undefined = picked.length
    ? picked.flatMap((f): LoadStatus[] => (f === "delivered" ? ["delivered"] : ["in_transit", "dispatched", "at_pickup", "at_delivery"]))
    : undefined;
  // ROUND 283.3 — board_scope is mandatory (Lead 2026-09-30). in_transit alone → live; anything else → history.
  const board_scope: "live" | "history" = picked.length === 1 && picked[0] === "in_transit" ? "live" : "history";

  const loadsQuery = useQuery({
    queryKey: ["invoice-create", "loads", operatingCompanyId, options.search, options.statusFilter, page, pageSize],
    queryFn: () =>
      listLoads({
        operating_company_id: operatingCompanyId ? [operatingCompanyId] : undefined,
        search: options.search || undefined,
        status,
        board_scope,
        limit: pageSize,
        offset,
        sort: "-pickup_date",
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: (loadId: string) => createInvoiceFromLoad(operatingCompanyId, { load_id: loadId }),
  });

  const loads: DispatchLoadRow[] = loadsQuery.data?.loads ?? [];
  const totalCount = loadsQuery.data?.total_count ?? loads.length;

  return {
    loads,
    totalCount,
    page,
    pageSize,
    isLoading: loadsQuery.isLoading,
    isError: loadsQuery.isError,
    error: loadsQuery.error,
    refetchLoads: loadsQuery.refetch,
    createFromLoad: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
