import { apiRequest } from "./client";

export function getAdminSyncHealth(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<Record<string, unknown>>(`/api/v1/admin/sync/health?${q}`);
}

export function postAdminSyncResetRealm(body: { operating_company_id: string; confirm: true }) {
  return apiRequest<{ ok: boolean }>(`/api/v1/admin/sync/reset-realm`, { method: "POST", body });
}
