import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../api/client";

export type AccountingCategoryRow = {
  id: string;
  qbo_id: string | null;
  name: string;
  account_type: string | null;
  account_number: string | null;
};

type Params = {
  operatingCompanyId: string;
  search?: string;
  enabled?: boolean;
};

export function useAccountingCategoriesQuery({ operatingCompanyId, search = "", enabled = true }: Params) {
  return useQuery({
    queryKey: ["accounting", "categories", operatingCompanyId, search],
    queryFn: async () => {
      const q = new URLSearchParams({
        operating_company_id: operatingCompanyId,
        type: "expense",
        limit: "50",
      });
      if (search.trim()) q.set("search", search.trim());
      const res = await apiRequest<{ categories: AccountingCategoryRow[] }>(`/api/v1/accounting/categories?${q}`);
      return res.categories;
    },
    enabled: Boolean(operatingCompanyId) && enabled,
    staleTime: 60_000,
  });
}
