import { apiRequest } from "./client";

export type LineItemUnit =
  | "per_loaded_mile"
  | "per_empty_mile"
  | "per_total_mile"
  | "flat_per_occurrence"
  | "flat_per_load"
  | "percent_of_load_revenue"
  | "flat_per_hour";

export type EquipmentLineItemTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: LineItemUnit;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
};

export type EquipmentType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  deactivated_at?: string | null;
  line_items: EquipmentLineItemTemplate[];
};

export type EquipmentTypeLineItemInput = {
  code: string;
  name: string;
  description?: string;
  unit: LineItemUnit;
  sort_order?: number;
  is_required?: boolean;
};

export type CreateEquipmentTypeInput = {
  code: string;
  name: string;
  description?: string;
  sort_order?: number;
  line_items: EquipmentTypeLineItemInput[];
};

export type UpdateEquipmentTypeInput = {
  name?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
};

export type UpdateLineItemTemplateInput = {
  name?: string;
  description?: string;
  unit?: LineItemUnit;
  sort_order?: number;
  is_required?: boolean;
  is_active?: boolean;
};

export type DriverLoadStatusPhase =
  | "pickup"
  | "transit_to_pickup"
  | "at_pickup"
  | "transit_to_delivery"
  | "at_delivery"
  | "completed"
  | "other";

export type DriverLoadStatus = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  phase: DriverLoadStatusPhase;
  sort_order: number;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
};

export type CreateDriverLoadStatusInput = {
  code: string;
  name: string;
  description?: string;
  phase: DriverLoadStatusPhase;
  sort_order?: number;
};

export type UpdateDriverLoadStatusInput = {
  name?: string;
  description?: string | null;
  phase?: DriverLoadStatusPhase;
  sort_order?: number;
  is_active?: boolean;
};

export type CatalogRegistryDepartment = "dispatch" | "safety" | "accounting" | "identity" | "operations";

export type CatalogRegistryItem = {
  code: string;
  name: string;
  description: string | null;
  route_path: string;
  icon_label: string;
  sort_order: number;
  item_count: number;
  last_updated_at: string | null;
};

export type CatalogRegistryDepartmentGroup = {
  code: CatalogRegistryDepartment;
  name: string;
  catalogs: CatalogRegistryItem[];
};

export type CatalogPreviewItem = {
  id: string;
  label: string;
  sub_label: string | null;
  route_path: string;
};

export type CatalogPreviewResponse = {
  code: string;
  name: string;
  items: CatalogPreviewItem[];
  truncated: boolean;
};

export type UsState = {
  id: string;
  code: string;
  name: string;
  region: "Northeast" | "Midwest" | "South" | "West" | "Territory";
};

export type MexicoState = {
  id: string;
  code: string;
  name: string;
  region: "Norte" | "Centro" | "Sur" | "Sureste" | "Bajio" | "Pacifico";
};

export type LoadCancellationReasonCategory =
  | "customer_initiated"
  | "carrier_initiated"
  | "force_majeure"
  | "other";

export type LoadCancellationReason = {
  id: string;
  operating_company_id: string;
  reason_code: string;
  display_name: string;
  category: LoadCancellationReasonCategory;
  is_active: boolean;
  sort_order: number;
  description: string | null;
};

export type CreateLoadCancellationReasonInput = {
  operating_company_id: string;
  reason_code: string;
  display_name: string;
  category: LoadCancellationReasonCategory;
  sort_order?: number;
  description?: string | null;
};

export type UpdateLoadCancellationReasonInput = Partial<{
  reason_code: string;
  display_name: string;
  category: LoadCancellationReasonCategory;
  sort_order: number;
  description: string | null;
}>;

export type DispatchFlagColor = {
  id: string;
  operating_company_id: string;
  flag_code: string;
  display_name: string;
  hex_color: string;
  icon_emoji: string | null;
  severity_order: number;
  sort_order: number;
  description: string | null;
  is_active: boolean;
};

export type CreateCatalogRegistryEntryInput = {
  code: string;
  name: string;
  description?: string;
  department: CatalogRegistryDepartment;
  route_path: string;
  icon_label: string;
  sort_order?: number;
};

export type UpdateCatalogRegistryEntryInput = Partial<{
  name: string;
  description: string | null;
  department: CatalogRegistryDepartment;
  route_path: string;
  icon_label: string;
  sort_order: number;
  is_active: boolean;
}>;

export function listEquipmentTypes(includeInactive = false) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<{ equipment_types: EquipmentType[] }>(`/api/v1/catalogs/equipment-types${query}`);
}

export function getEquipmentType(id: string) {
  return apiRequest<{ equipment_type: EquipmentType }>(`/api/v1/catalogs/equipment-types/${id}`);
}

export function createEquipmentType(payload: CreateEquipmentTypeInput) {
  return apiRequest<{ id: string }>("/api/v1/catalogs/equipment-types", { method: "POST", body: payload });
}

export function updateEquipmentType(id: string, payload: UpdateEquipmentTypeInput) {
  return apiRequest<{ ok: true }>(`/api/v1/catalogs/equipment-types/${id}`, { method: "PATCH", body: payload });
}

export function addLineItemTemplate(equipmentTypeId: string, payload: EquipmentTypeLineItemInput) {
  return apiRequest<{ id: string }>(`/api/v1/catalogs/equipment-types/${equipmentTypeId}/line-items`, {
    method: "POST",
    body: payload,
  });
}

export function updateLineItemTemplate(id: string, payload: UpdateLineItemTemplateInput) {
  return apiRequest<{ ok: true }>(`/api/v1/catalogs/equipment-line-items/${id}`, { method: "PATCH", body: payload });
}

export function listDriverLoadStatuses(includeInactive = false) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<{ statuses: DriverLoadStatus[] }>(`/api/v1/catalogs/driver-load-statuses${query}`);
}

export function createDriverLoadStatus(payload: CreateDriverLoadStatusInput) {
  return apiRequest<{ status: DriverLoadStatus }>("/api/v1/catalogs/driver-load-statuses", { method: "POST", body: payload });
}

export function updateDriverLoadStatus(id: string, payload: UpdateDriverLoadStatusInput) {
  return apiRequest<{ status: DriverLoadStatus }>(`/api/v1/catalogs/driver-load-statuses/${id}`, { method: "PATCH", body: payload });
}

export function listCatalogRegistry() {
  return apiRequest<{ departments: CatalogRegistryDepartmentGroup[] }>("/api/v1/catalogs/registry");
}

export function previewCatalog(code: string) {
  return apiRequest<CatalogPreviewResponse>(`/api/v1/catalogs/registry/${code}/preview`);
}

export function createCatalogRegistryEntry(payload: CreateCatalogRegistryEntryInput) {
  return apiRequest<{ entry: unknown }>("/api/v1/catalogs/registry", { method: "POST", body: payload });
}

export function updateCatalogRegistryEntry(id: string, payload: UpdateCatalogRegistryEntryInput) {
  return apiRequest<{ entry: unknown }>(`/api/v1/catalogs/registry/${id}`, { method: "PATCH", body: payload });
}

export function listUsStates() {
  return apiRequest<{ states: UsState[] }>("/api/v1/catalogs/us-states");
}

export function listMexicoStates() {
  return apiRequest<{ states: MexicoState[] }>("/api/v1/catalogs/mexico-states");
}

export function listLoadCancellationReasons(operatingCompanyId: string, includeInactive = false) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (includeInactive) query.set("include_inactive", "true");
  return apiRequest<{ reasons: LoadCancellationReason[] }>(`/api/v1/catalogs/load-cancellation-reasons?${query.toString()}`);
}

export function createLoadCancellationReason(payload: CreateLoadCancellationReasonInput) {
  return apiRequest<{ reason: LoadCancellationReason }>("/api/v1/catalogs/load-cancellation-reasons", {
    method: "POST",
    body: payload,
  });
}

export function updateLoadCancellationReason(id: string, payload: UpdateLoadCancellationReasonInput) {
  return apiRequest<{ reason: LoadCancellationReason }>(`/api/v1/catalogs/load-cancellation-reasons/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deactivateLoadCancellationReason(id: string) {
  return apiRequest<{ reason: LoadCancellationReason }>(`/api/v1/catalogs/load-cancellation-reasons/${id}/deactivate`, {
    method: "POST",
  });
}

export function reactivateLoadCancellationReason(id: string) {
  return apiRequest<{ reason: LoadCancellationReason }>(`/api/v1/catalogs/load-cancellation-reasons/${id}/reactivate`, {
    method: "POST",
  });
}

export function listDispatchFlagColors(operatingCompanyId: string) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ flags: DispatchFlagColor[] }>(`/api/v1/catalogs/dispatch-flag-colors?${query.toString()}`);
}
