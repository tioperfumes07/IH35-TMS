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
