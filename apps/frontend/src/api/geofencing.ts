import { apiRequest } from "./client";

export type GeofenceLocationKind = "customer_site" | "yard" | "vendor_site" | "custom" | "dot_inspection_station";

export type Geofence = {
  id: string;
  operating_company_id: string;
  label: string;
  location_kind: GeofenceLocationKind;
  location_ref_id: string | null;
  is_active: boolean;
  polygon_geojson: {
    type: "Polygon";
    coordinates: number[][][];
  };
  created_at: string;
  created_by_user_uuid: string | null;
  updated_at: string;
  updated_by_user_uuid: string | null;
};

export type GeofenceDwellRow = {
  geofence_id: string;
  geofence_label: string;
  location_kind: GeofenceLocationKind;
  location_ref_id: string | null;
  unit_id: string;
  unit_number: string;
  driver_id: string | null;
  first_name: string | null;
  last_name: string | null;
  entered_at: string;
  exited_at: string | null;
  dwell_minutes: number | null;
};

export function listGeofences(operatingCompanyId: string) {
  return apiRequest<{ geofences: Geofence[] }>(
    `/api/v1/telematics/geofences?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createGeofence(body: {
  operating_company_id: string;
  label: string;
  location_kind: GeofenceLocationKind;
  location_ref_id?: string | null;
  is_active?: boolean;
  polygon_geojson: Geofence["polygon_geojson"];
}) {
  return apiRequest<Geofence>("/api/v1/telematics/geofences", { method: "POST", body });
}

export function updateGeofence(
  id: string,
  body: Partial<{
    label: string;
    location_kind: GeofenceLocationKind;
    location_ref_id: string | null;
    is_active: boolean;
    polygon_geojson: Geofence["polygon_geojson"];
  }>
) {
  return apiRequest<Geofence>(`/api/v1/telematics/geofences/${id}`, { method: "PATCH", body });
}

export function getGeofenceDwellReport(params: {
  operating_company_id: string;
  period_start: string;
  period_end: string;
  geofence_id?: string;
  location_kind?: GeofenceLocationKind;
}) {
  const q = new URLSearchParams({
    operating_company_id: params.operating_company_id,
    period_start: params.period_start,
    period_end: params.period_end,
  });
  if (params.geofence_id) q.set("geofence_id", params.geofence_id);
  if (params.location_kind) q.set("location_kind", params.location_kind);
  return apiRequest<{ period: { start: string; end: string }; rows: GeofenceDwellRow[] }>(
    `/api/v1/reports/geofence-dwell?${q.toString()}`
  );
}
