import { driverApiRequest } from "./driver-client";

export type DriverMeResponse = {
  driver: {
    id: string;
    full_name: string;
    status: string;
    preferred_language: "en" | "es";
  };
  operating_company_id: string;
  identity_user_id: string;
};

export type DriverLoad = {
  id: string;
  display_id: string;
  customer_name: string;
  pickup_location: string;
  delivery_location: string;
  lifecycle_stage: string;
  stops: Array<{
    id: string;
    sequence: number;
    type: string;
    city: string;
    state: string;
    status: string;
    scheduled_arrival_at: string;
  }>;
  rate_confirmation_html: string;
};

export type HosSnapshot = {
  duty_status: string;
  clocks: Array<{ key: string; remaining_minutes: number; max_minutes: number }>;
  last_synced_at: string;
};

export async function getDriverMe() {
  return driverApiRequest<DriverMeResponse>("/api/v1/driver/me");
}

export async function listDriverLoads() {
  return driverApiRequest<DriverLoad[]>("/api/v1/driver/loads");
}

export async function getDriverLoad(id: string) {
  return driverApiRequest<DriverLoad>(`/api/v1/driver/loads/${encodeURIComponent(id)}`);
}

export async function getDriverHos() {
  return driverApiRequest<HosSnapshot>("/api/v1/driver/hos");
}

export async function submitDriverReport(body: Record<string, unknown>) {
  return driverApiRequest<{ id: string }>("/api/v1/driver/reports", { method: "POST", body });
}

export type AssignedLoadRow = {
  id: string;
  load_number: string | null;
  status: string;
  operating_company_id: string;
  rate_total_cents: unknown;
};

export async function listDriverAssignedLoads() {
  return driverApiRequest<{ loads: AssignedLoadRow[] }>("/api/v1/driver/loads/assigned");
}

export async function acceptDriverOffer(loadId: string) {
  return driverApiRequest<{ ok: true }>(`/api/v1/driver/loads/${encodeURIComponent(loadId)}/accept-offer`, {
    method: "POST",
    body: { confirm: true as const },
  });
}

export async function declineDriverOffer(loadId: string, reason?: string) {
  return driverApiRequest<{ ok: true }>(`/api/v1/driver/loads/${encodeURIComponent(loadId)}/decline-offer`, {
    method: "POST",
    body: { reason },
  });
}

export async function postDriverLoadStatus(
  loadId: string,
  body: { status: "at_pickup" | "in_transit" | "at_delivery" | "delivered"; location: { lat: number; lng: number }; timestamp: string; notes?: string }
) {
  return driverApiRequest<{ ok: true }>(`/api/v1/driver/loads/${encodeURIComponent(loadId)}/status`, { method: "POST", body });
}

export type TimeOffDriverRow = {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  notes: string | null;
  created_at: string;
  decided_at: string | null;
  decision_notes: string | null;
};

export async function listDriverTimeOffRequests() {
  return driverApiRequest<{ requests: TimeOffDriverRow[] }>("/api/v1/driver/time-off-requests");
}

export async function createDriverTimeOffRequest(body: { start_date: string; end_date: string; type: "vacation" | "sick" | "personal"; notes?: string }) {
  return driverApiRequest<TimeOffDriverRow>(`/api/v1/driver/time-off-requests`, { method: "POST", body });
}
