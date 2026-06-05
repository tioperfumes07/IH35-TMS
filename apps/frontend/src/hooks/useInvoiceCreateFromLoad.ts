import { useMutation, useQuery } from "@tanstack/react-query";
import { createInvoiceFromLoad } from "../api/accounting";
import { listLoads, type DispatchLoadRow } from "../api/loads";

export type LoadStatusFilter = "all" | "delivered" | "in_transit";

export function useInvoiceCreateFromLoad(operatingCompanyId: string, options: { search?: string; statusFilter?: LoadStatusFilter; page?: number; pageSize?: number }) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;
  const offset = (page - 1) * pageSize;

  const status =
    options.statusFilter === "delivered"
      ? (["delivered"] as const)
      : options.statusFilter === "in_transit"
        ? (["in_transit", "dispatched", "at_pickup", "loaded", "at_delivery"] as const)
        : undefined;

  const loadsQuery = useQuery({
    queryKey: ["invoice-create", "loads", operatingCompanyId, options.search, options.statusFilter, page, pageSize],
    queryFn: () =>
      listLoads({
        operating_company_id: operatingCompanyId ? [operatingCompanyId] : undefined,
        search: options.search || undefined,
        status: status ? [...status] : undefined,
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
    error: loadsQuery.error,
    createFromLoad: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
