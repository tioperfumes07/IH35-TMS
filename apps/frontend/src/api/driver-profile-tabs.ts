/**
 * ORDERS 2026-10-01 DRIVER PROFILE — read-only tab endpoints (CC-3 backend).
 * GET /api/v1/drivers/:driverId/profile/{assignments|stops-miles|fuel|safety|samsara}
 */
import { apiRequest } from "./client";

function qs(companyId: string, window?: { from?: string; to?: string }) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  if (window?.from) q.set("from", window.from);
  if (window?.to) q.set("to", window.to);
  return q.toString();
}

export type DriverAssignmentRow = {
  id: string;
  unit_id: string;
  unit_number: string | null;
  started_at: string;
  ended_at: string | null;
  source: string | null;
  is_default: boolean | null;
};

export type DriverFuelFillRow = {
  id: string;
  unit_id: string;
  unit_number: string | null;
  transaction_at: string;
  fuel_type: string | null;
  gallons: number | string | null;
  total_cost: number | string | null;
  location_city: string | null;
  location_state: string | null;
  load_id: string | null;
  load_number: string | null;
  purchase_ineligible_reason: string | null;
  fraud_alerts: Array<{ rule_id?: string; severity?: string; status?: string; detected_at?: string }> | null;
  gps_match: { distance_m?: number; confidence?: string; review_flag?: boolean; reason?: string } | null;
};

export type DriverSafetyBundle = {
  driver_id: string;
  faults: Array<Record<string, unknown>>;
  harsh_events: Array<Record<string, unknown>>;
  dvirs: Array<Record<string, unknown>>;
  dot_inspections: Array<Record<string, unknown>>;
};

export type DriverSamsaraLink = {
  driver_id: string;
  samsara_accounts: Array<{
    samsara_driver_id: string;
    samsara_username: string | null;
    last_login_at: string | null;
    is_active: boolean | null;
  }>;
  other_live_drivers_with_these_ids: Array<{
    driver_id: string;
    name: string | null;
    status: string | null;
    samsara_driver_id: string;
  }>;
  duplicate_warning: boolean;
};

export type DriverStopsMiles = {
  source: string;
  stops: Array<Record<string, unknown>>;
  read_miles: number;
};

export function getDriverProfileAssignments(
  companyId: string,
  driverId: string,
  window?: { from?: string; to?: string },
) {
  return apiRequest<{ driver_id: string; assignments: DriverAssignmentRow[] }>(
    `/api/v1/drivers/${encodeURIComponent(driverId)}/profile/assignments?${qs(companyId, window)}`,
  );
}

export function getDriverProfileStopsMiles(
  companyId: string,
  driverId: string,
  window?: { from?: string; to?: string },
) {
  return apiRequest<DriverStopsMiles>(
    `/api/v1/drivers/${encodeURIComponent(driverId)}/profile/stops-miles?${qs(companyId, window)}`,
  );
}

export function getDriverProfileFuel(
  companyId: string,
  driverId: string,
  window?: { from?: string; to?: string },
) {
  return apiRequest<{ driver_id: string; fills: DriverFuelFillRow[]; attribution: string }>(
    `/api/v1/drivers/${encodeURIComponent(driverId)}/profile/fuel?${qs(companyId, window)}`,
  );
}

export function getDriverProfileSafety(
  companyId: string,
  driverId: string,
  window?: { from?: string; to?: string },
) {
  return apiRequest<DriverSafetyBundle>(
    `/api/v1/drivers/${encodeURIComponent(driverId)}/profile/safety?${qs(companyId, window)}`,
  );
}

export function getDriverProfileSamsara(companyId: string, driverId: string) {
  return apiRequest<DriverSamsaraLink>(
    `/api/v1/drivers/${encodeURIComponent(driverId)}/profile/samsara?${qs(companyId)}`,
  );
}
