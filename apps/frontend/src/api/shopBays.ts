// LEAD 443.301 · register row 59 — Maintenance › In Shop bays (backend maintenance/shop-bays.routes.ts).
import { apiRequest } from "./client";

export type BayWorkOrder = {
  work_order_id: string;
  display_id: string | null;
  status: string;
  unit_id: string | null;
  unit_number: string | null;
  title: string | null;
  bay_number: number | null;
  bay_assigned_at: string | null;
  in_shop_at: string | null;
  expected_release_at: string | null;
};
export type ShopBay = { bay_number: number; work_order: BayWorkOrder | null };
export type ShopBaysPayload = { operating_company_id: string; bay_count: number; bays: ShopBay[]; yard: BayWorkOrder[] };

const q = (companyId: string) => `operating_company_id=${encodeURIComponent(companyId)}`;

export function getShopBays(companyId: string) {
  return apiRequest<ShopBaysPayload>(`/api/v1/maintenance/shop-bays?${q(companyId)}`);
}
export function assignWorkOrderBay(companyId: string, workOrderId: string, bayNumber: number) {
  return apiRequest<ShopBaysPayload>(`/api/v1/maintenance/work-orders/${encodeURIComponent(workOrderId)}/bay?${q(companyId)}`, {
    method: "POST",
    body: { bay_number: bayNumber },
  });
}
export function releaseWorkOrderBay(companyId: string, workOrderId: string) {
  return apiRequest<ShopBaysPayload>(`/api/v1/maintenance/work-orders/${encodeURIComponent(workOrderId)}/bay/release?${q(companyId)}`, {
    method: "POST",
    body: {},
  });
}
