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
