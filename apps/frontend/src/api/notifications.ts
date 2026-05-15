import { apiRequest } from "./client";

export type InAppNotificationRow = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export function listNotifications(operatingCompanyId: string, opts: { unread_only?: boolean; limit?: number } = {}) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (opts.unread_only) q.set("unread_only", "true");
  if (opts.limit != null) q.set("limit", String(opts.limit));
  return apiRequest<{ notifications: InAppNotificationRow[]; unread_count: number }>(`/api/v1/notifications?${q}`);
}

export function markNotificationRead(id: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ ok: true }>(`/api/v1/notifications/${encodeURIComponent(id)}/mark-read?${q}`, { method: "POST", body: {} });
}

export function markAllNotificationsRead(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ ok: true }>(`/api/v1/notifications/mark-all-read?${q}`, { method: "POST", body: {} });
}
