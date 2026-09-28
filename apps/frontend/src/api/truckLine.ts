import { apiRequest } from "./client";

export type TruckLineStampSource = "driver_app" | "eld_geofence" | "manual" | null;
export type TruckLineStamp = { at: string; source: TruckLineStampSource } | null;

export type TruckLineStation = {
  reached_index: number;
  next_index: number | null;
  stamps: (TruckLineStamp | null)[];
  has_open_exception: boolean;
  exception_reason_label: string | null;
  open_exception_id: string | null;
};

export type TruckLinePosition = {
  lat: number | null;
  lng: number | null;
  speed_mph: number | null;
  engine_state: string | null;
  city: string | null;
  state: string | null;
  formatted_location: string | null;
  captured_at: string;
  stale_minutes: number | null;
  stale: boolean;
};

export type TruckLineNextAppointment = {
  type: "pickup" | "delivery";
  at: string | null;
  at_source: "appointment_start_at" | "scheduled_arrival_at" | null;
  late: boolean;
};

export type TruckLineAppointmentLeg = {
  at: string;
  at_source: "appointment_start_at" | "scheduled_arrival_at" | null;
  late: boolean;
} | null;

export type TruckLineAppointments = {
  pickup: TruckLineAppointmentLeg;
  delivery: TruckLineAppointmentLeg;
} | null;

export type TruckLineDriver = { id: string; name: string | null };

export type TruckLineLoad = {
  load_id: string;
  load_number: string | null;
  trip_type: string | null;
  rate_total_cents: number | null;
  customer_name: string | null;
  pickup: { city: string | null; state: string | null };
  delivery: { city: string | null; state: string | null };
};

export type TruckLineAvailable = {
  driver_id: string;
  driving_minutes_remaining: number | null;
  cycle_minutes_remaining: number | null;
  hos_polled_minutes_ago: number | null;
  last_closed_load_number: string | null;
  parked_city: string | null;
  parked_state: string | null;
};

export type TruckLineRow = {
  kind: "loaded" | "available";
  unit_id: string | null;
  unit_number: string | null;
  /** P-series tour / pre-settlement number — never a UUID (ROUND 155.6). */
  tour_display_id?: string | null;
  load: TruckLineLoad | null;
  drivers: TruckLineDriver[];
  station: TruckLineStation | null;
  position: TruckLinePosition | null;
  next_appointment: TruckLineNextAppointment | null;
  appointments: TruckLineAppointments;
  available?: TruckLineAvailable;
};

export type TruckLineSection = "tour" | "in_transit" | "available";

/** Top-level unit group — unit_id appears once. Tour legs stack under `legs`. */
export type TruckLineGroup = {
  section: TruckLineSection;
  unit_id: string;
  unit_number: string;
  tour_display_id: string | null;
  legs: TruckLineRow[];
};

export type TruckLineStationDef = { key: string; index: number; label: string };

export type TruckLineResponse = {
  groups: TruckLineGroup[];
  rows: TruckLineRow[];
  total_count: number;
  loaded_count: number;
  available_count: number;
  tour_count?: number;
  in_transit_count?: number;
  stations: TruckLineStationDef[];
  catalog_ready: boolean;
};

export function getTruckLine(operatingCompanyId: string) {
  return apiRequest<TruckLineResponse>(`/api/v1/dispatch/truck-line?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function stampTruckLineArrival(loadId: string, stopId: string, operatingCompanyId: string) {
  return apiRequest<{ ok: true; proforma_invoice: unknown }>(
    `/api/v1/dispatch/truck-line/loads/${loadId}/stops/${stopId}/arrive`,
    { method: "POST", body: { operating_company_id: operatingCompanyId } }
  );
}

export function stampTruckLineDeparture(loadId: string, stopId: string, operatingCompanyId: string) {
  return apiRequest<{ ok: true; proforma_invoice: unknown }>(
    `/api/v1/dispatch/truck-line/loads/${loadId}/stops/${stopId}/depart`,
    { method: "POST", body: { operating_company_id: operatingCompanyId } }
  );
}

export type LoadExceptionReason = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export function listLoadExceptionReasons(operatingCompanyId: string) {
  return apiRequest<{ reasons: LoadExceptionReason[]; catalog_ready: boolean }>(
    `/api/v1/catalogs/load-exception-reasons?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function recordTruckLineException(body: {
  operating_company_id: string;
  load_id: string;
  reason_id?: string;
  issue_category: string;
  issue_description: string;
  severity: "info" | "warning" | "severe";
  driver_id?: string;
  unit_id?: string;
}) {
  return apiRequest<{ id: string; reported_at: string }>(`/api/v1/dispatch/intransit-issues/office`, {
    method: "POST",
    body,
  });
}

export function resolveTruckLineException(id: string, operatingCompanyId: string, notes?: string) {
  return apiRequest<{ id: string; status: string }>(`/api/v1/dispatch/intransit-issues/${id}/resolve`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, notes },
  });
}
