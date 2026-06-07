import { apiRequest } from "../api/client";

export type DispatchViewStop = {
  stop_uuid: string;
  sequence: number;
  type: "pickup" | "delivery" | "fuel" | "break";
  location_name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  scheduled_arrival_at: string;
  scheduled_departure_at: string;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: "pending" | "arrived" | "loading" | "loaded" | "departed";
  contact_name: string | null;
  contact_phone: string | null;
  hours: string | null;
  dispatcher_notes: string | null;
  doc_requirements: string[];
  geofence_status: "pending" | "entered" | "exited";
  docs_uploaded: boolean;
};

export type DispatchViewPayload = {
  load_uuid: string;
  load_number: string;
  customer_name: string;
  status: string;
  pickup_contact: { name: string | null; phone: string | null };
  delivery_contact: { name: string | null; phone: string | null };
  special_instructions: string | null;
  stops: DispatchViewStop[];
};

export async function fetchDispatchView(loadUuid: string): Promise<DispatchViewPayload> {
  return apiRequest<DispatchViewPayload>(`/api/dispatch/driver-pwa/load/${encodeURIComponent(loadUuid)}/dispatch-view`);
}

export async function markDispatchStopArrival(
  loadUuid: string,
  stopUuid: string,
  geo: { lat: number; lng: number; accuracy_m: number }
): Promise<{ ok: boolean; geofence_status: string }> {
  return apiRequest(`/api/dispatch/driver-pwa/load/${encodeURIComponent(loadUuid)}/stops/${encodeURIComponent(stopUuid)}/arrival`, {
    method: "POST",
    body: {
      geo_lat: geo.lat,
      geo_lng: geo.lng,
      geo_accuracy_m: geo.accuracy_m,
    },
  });
}

export async function markDispatchStopDeparture(
  loadUuid: string,
  stopUuid: string,
  geo: { lat: number; lng: number; accuracy_m: number }
): Promise<{ ok: boolean; geofence_status: string }> {
  return apiRequest(`/api/dispatch/driver-pwa/load/${encodeURIComponent(loadUuid)}/stops/${encodeURIComponent(stopUuid)}/departure`, {
    method: "POST",
    body: {
      geo_lat: geo.lat,
      geo_lng: geo.lng,
      geo_accuracy_m: geo.accuracy_m,
    },
  });
}

export async function attachStopDocument(
  loadUuid: string,
  stopUuid: string,
  payload: { evidence_uuid: string; doc_type: "bol" | "pod" | "lumper_receipt" | "other" }
): Promise<{ ok: boolean; evidence_uuid: string; doc_type: string }> {
  return apiRequest(`/api/dispatch/driver-pwa/load/${encodeURIComponent(loadUuid)}/stops/${encodeURIComponent(stopUuid)}/document`, {
    method: "POST",
    body: payload,
  });
}
