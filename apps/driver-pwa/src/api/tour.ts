import { apiRequest } from "./client";

// TOUR CLOSE + GEOFENCE (owner direct instruction, 2026-09-02). Mirrors
// apps/backend/src/dispatch/driver-pwa/tour-close.service.ts's TourCloseEligibility /
// TourCloseResult shapes exactly — see that file for the full design rationale.

export type TourCloseEligibility = {
  can_close: boolean;
  has_active_load: boolean;
  active_load_numbers: string[];
  at_yard: boolean;
  unit_id: string | null;
  unit_number: string | null;
  position_captured_at: string | null;
  position_stale_or_missing: boolean;
  yard_geofence_id: string | null;
  should_prompt_deadhead_to_yard: boolean;
  reason: string;
};

export type TourCloseResult = {
  closed: boolean;
  settlement_id: string | null;
  settlement_number: string | null;
  trip_closed_at: string | null;
};

export async function getTourCloseEligibility(): Promise<TourCloseEligibility> {
  return apiRequest<TourCloseEligibility>("/api/v1/driver-pwa/tour/close-eligibility");
}

export async function closeTour(): Promise<TourCloseResult> {
  return apiRequest<TourCloseResult>("/api/v1/driver-pwa/tour/close", { method: "POST" });
}
