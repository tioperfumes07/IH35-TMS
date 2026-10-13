import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../api/client";

export type AccountingItemRow = {
  id: string;
  qbo_id: string | null;
  name: string;
  item_type: string | null;
  unit_price_cents: number | null;
};

type Params = {
  operatingCompanyId: string;
  kind?: "service" | "inventory" | "labor" | "all";
  search?: string;
  enabled?: boolean;
  /** 443.113 DEGH-03 — only the items whose default expense account is this account (a check category line's item). */
  expenseAccountId?: string | null;
};

export function useAccountingItemsQuery({
  operatingCompanyId,
  kind = "service",
  search = "",
  enabled = true,
  expenseAccountId = null,
}: Params) {
  return useQuery({
    queryKey: ["accounting", "items", operatingCompanyId, kind, search, expenseAccountId],
    queryFn: async () => {
      const q = new URLSearchParams({
        operating_company_id: operatingCompanyId,
        kind,
        limit: "50",
      });
      if (search.trim()) q.set("search", search.trim());
      if (expenseAccountId) q.set("expense_account_id", expenseAccountId);
      const res = await apiRequest<{ items: AccountingItemRow[] }>(`/api/v1/accounting/items-for-wo?${q}`);
      return res.items;
    },
    enabled: Boolean(operatingCompanyId) && enabled,
    staleTime: 60_000,
  });
}
