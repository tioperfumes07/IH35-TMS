import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export type ListsInventoryRow = {
  domain: string;
  catalog_key: string;
  display_name: string;
  row_count: number;
};

export type ListsRecentActivityRow = {
  created_at: string;
  event_type: string;
  catalog_key: string;
  action: string;
  entity_name: string;
  user_display_name: string;
  qbo_sync_status: string;
};

export type ListsQboSyncHealthRow = {
  entity: string;
  local_count: number;
  qbo_count: number | null;
  pending_count: number;
  drift: string;
};

export function getListsInventory(companyId: string) {
  return apiRequest<{ inventory: ListsInventoryRow[] }>(`/api/v1/lists/inventory?${q(companyId)}`);
}

export function getListsRecentActivity(companyId: string) {
  return apiRequest<{ activity: ListsRecentActivityRow[] }>(`/api/v1/lists/recent-activity?${q(companyId)}`);
}

export function getListsQboSyncHealth(companyId: string) {
  return apiRequest<{ health: ListsQboSyncHealthRow[] }>(`/api/v1/lists/qbo-sync-health?${q(companyId)}`);
}

export function postForceListsQboSync(companyId: string) {
  return apiRequest<{ started: boolean; idempotency_key: string }>(`/api/v1/lists/force-qbo-sync`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

