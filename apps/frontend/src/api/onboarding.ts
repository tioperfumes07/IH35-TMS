import { apiRequest } from "./client";

export type OnboardingSession = {
  id: string;
  operating_company_id: string;
  driver_id: string | null;
  current_step: number;
  status: "in_progress" | "completed" | "cancelled";
  step_data: Record<string, Record<string, unknown>>;
  admin_override: boolean;
  admin_override_reason: string | null;
  admin_override_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export const ONBOARDING_STEP_LABELS = [
  "Identity",
  "CDL Upload",
  "Medical Card",
  "DQF Docs",
  "Signatures",
  "I-9",
  "Vehicle Assignment",
] as const;

export function createOnboardingSession(payload: { operating_company_id: string; driver_id?: string }) {
  return apiRequest<{ session: OnboardingSession }>("/api/v1/safety/onboarding/sessions", {
    method: "POST",
    body: payload,
  });
}

export function getOnboardingSession(sessionId: string, operatingCompanyId: string) {
  return apiRequest<{ session: OnboardingSession; steps: string[] }>(
    `/api/v1/safety/onboarding/sessions/${sessionId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function saveOnboardingStep(
  sessionId: string,
  operatingCompanyId: string,
  payload: { step: number; step_data: Record<string, unknown>; advance?: boolean }
) {
  return apiRequest<{ session: OnboardingSession }>(
    `/api/v1/safety/onboarding/sessions/${sessionId}/step?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body: payload }
  );
}

export function completeOnboardingSession(sessionId: string, operatingCompanyId: string) {
  return apiRequest<{ session: OnboardingSession }>(
    `/api/v1/safety/onboarding/sessions/${sessionId}/complete?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST" }
  );
}

export function adminOverrideOnboardingSession(
  sessionId: string,
  operatingCompanyId: string,
  payload: { reason: string; missing_steps?: number[] }
) {
  return apiRequest<{ session: OnboardingSession }>(
    `/api/v1/safety/onboarding/sessions/${sessionId}/admin-override?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: payload }
  );
}
