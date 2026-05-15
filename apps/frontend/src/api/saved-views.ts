import { apiRequest } from "./client";

export type SavedViewRow = {
  id: string;
  table_name: string;
  name: string;
  view_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export function listSavedViews(tableName: string) {
  const q = new URLSearchParams({ table_name: tableName });
  return apiRequest<{ views: SavedViewRow[] }>(`/api/v1/user-saved-views?${q}`);
}

export function saveView(tableName: string, name: string, viewJson: Record<string, unknown>) {
  return apiRequest<SavedViewRow>(`/api/v1/user-saved-views`, { method: "POST", body: { table_name: tableName, name, view_json: viewJson } });
}

export function deleteSavedView(id: string) {
  return apiRequest<{ ok: true }>(`/api/v1/user-saved-views/${encodeURIComponent(id)}`, { method: "DELETE" });
}
