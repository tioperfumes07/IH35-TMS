import { apiRequest } from "./client";

export type AdminActivityItem = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: unknown;
  payload_preview: string;
  severity: string;
  source: string | null;
};

export type AdminActivityResponse = {
  items: AdminActivityItem[];
  next_cursor: string | null;
};

export async function fetchAdminActivity(query: URLSearchParams): Promise<AdminActivityResponse> {
  return apiRequest<AdminActivityResponse>(`/api/v1/admin/activity?${query.toString()}`);
}
