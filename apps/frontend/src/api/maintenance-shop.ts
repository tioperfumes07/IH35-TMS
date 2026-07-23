import { apiRequest } from "./client";

export type MaintenanceShopHubRow = {
  kind: "bill" | "expense";
  financial_id: string;
  financial_label: string | null;
  txn_date: string | null;
  amount_cents: number;
  status: string | null;
  work_order_id: string;
  work_order_display_id: string | null;
  unit_id: string | null;
  unit_code: string | null;
};

export type MaintenanceShopHubResponse = {
  total: number;
  limit: number;
  offset: number;
  items: MaintenanceShopHubRow[];
};

export function getMaintenanceShopHub(
  operatingCompanyId: string,
  options?: { workOrderId?: string; limit?: number; offset?: number }
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (options?.workOrderId) params.set("work_order_id", options.workOrderId);
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  return apiRequest<MaintenanceShopHubResponse>(`/api/v1/accounting/maintenance-shop/hub?${params}`);
}
