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
  onboarding_completed_at: string | null;
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

export type DriverArrivalPrompt = {
  id: string;
  stop_id: string;
  unit_id: string;
  triggered_at: string;
  distance_at_trigger_ft: number;
  stop_name: string | null;
  load_id: string;
  load_number: string | null;
};

export type DriverStatusSuggestion = {
  id: string;
  load_id: string;
  load_number: string | null;
  suggested_from: string;
  suggested_to: string;
  reason: string;
  suggested_at: string;
};

export async function getDriverMe() {
  return driverApiRequest<DriverMeResponse>("/api/v1/driver/me");
}

export async function patchDriverOnboarding(body: { complete: boolean }) {
  return driverApiRequest<{ ok: boolean; onboarding_completed_at: string | null }>("/api/v1/driver/me/onboarding", {
    method: "PATCH",
    body,
  });
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

export async function listDriverArrivalPrompts() {
  return driverApiRequest<{ prompts: DriverArrivalPrompt[] }>("/api/v1/driver/arrival-prompts");
}

export async function confirmDriverArrivalPrompt(id: string, body: { confirmed_at?: string } = {}) {
  return driverApiRequest<{ ok: boolean }>(`/api/v1/driver/arrival-prompts/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body,
  });
}

export async function dismissDriverArrivalPrompt(id: string, body: { reason?: string } = {}) {
  return driverApiRequest<{ ok: boolean }>(`/api/v1/driver/arrival-prompts/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
    body,
  });
}

export async function listDriverStatusSuggestions() {
  return driverApiRequest<{ suggestions: DriverStatusSuggestion[] }>("/api/v1/driver/status-suggestions");
}

export async function respondDriverStatusSuggestion(
  id: string,
  body: { response: "confirmed" | "overridden" | "dismissed" | "expired"; note?: string }
) {
  return driverApiRequest<{ ok: boolean }>(`/api/v1/driver/status-suggestions/${encodeURIComponent(id)}/respond`, {
    method: "POST",
    body,
  });
}
