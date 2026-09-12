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

export type TruckLineRow = {
  unit_id: string;
  unit_number: string;
  load: TruckLineLoad | null;
  drivers: TruckLineDriver[];
  station: TruckLineStation | null;
  position: TruckLinePosition | null;
  next_appointment: TruckLineNextAppointment | null;
};

export type TruckLineStationDef = { key: string; index: number; label: string };

export type TruckLineResponse = {
  rows: TruckLineRow[];
  total_count: number;
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

// DO NOT hardcode reason names/codes here — the "Other" pop-up shows only what
// GET /api/v1/catalogs/load-exception-reasons actually returns from the live catalog table. Until
// CC-1's migration lands, that endpoint returns an empty list and the pop-up renders an honest
// "reason catalog not yet available" state — never a guessed/typed-in-React list.
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
