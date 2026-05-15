import { apiRequest } from "./client";
import type { AuthMeResponse, IdentityUser, IdentityWorkflowRequest, UserRole } from "../types/api";

export type DispatcherErrorReason = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  event_type:
    | "customer_complaint"
    | "missed_appointment"
    | "unpaid_invoice_responsibility"
    | "abandoned_load_dispatcher_fault"
    | "rate_below_threshold_unjustified"
    | "driver_complaint_validated"
    | "commendation"
    | "training_required"
    | "policy_violation"
    | "other";
  severity: "info" | "warning" | "severe";
  is_active: boolean;
  deactivated_at: string | null;
};

export type DispatcherSafetyEvent = {
  id: string;
  dispatcher_user_id: string;
  event_type: DispatcherErrorReason["event_type"];
  event_date: string;
  severity: DispatcherErrorReason["severity"];
  summary: string;
  details: string | null;
  error_reason_id: string | null;
  error_reason_code?: string | null;
  error_reason_label?: string | null;
  cost_amount: number | null;
  cost_currency: string;
  cost_recovered_amount: number | null;
  cost_recovery_status: "pending" | "partial" | "recovered" | "waived" | "absorbed" | null;
  related_load_id: string | null;
  related_customer_id: string | null;
  related_driver_id: string | null;
  document_ids: string[] | null;
  dispatcher_email_snapshot: string | null;
  voided_at: string | null;
  voided_by_user_id: string | null;
  voided_by_user_email?: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ReturningDispatcherDetectionResult = {
  returning_dispatcher: boolean;
  matched_events: Array<{
    event_id: string;
    dispatcher_user_id: string;
    event_type: DispatcherErrorReason["event_type"];
    event_date: string;
    severity: DispatcherErrorReason["severity"];
    summary: string;
    cost_amount: number | null;
    cost_currency: string;
    cost_recovery_status: string | null;
    error_reason: { code: string; label: string } | null;
    voided: boolean;
  }>;
  severity_summary: { severe_count: number; warning_count: number; info_count: number };
};

export type IdentityUserDetail = {
  user: IdentityUser;
  has_driver_record: boolean;
  accessible_companies: Array<{
    id: string;
    code: string;
    legal_name: string;
    short_name: string | null;
  }>;
};

export function getMe() {
  return apiRequest<AuthMeResponse>("/api/v1/auth/me");
}

export function getIdentityProfile() {
  return apiRequest<IdentityUser>("/api/v1/identity/me");
}

export function patchIdentityOnboarding(body: { complete: boolean }) {
  return apiRequest<IdentityUser>("/api/v1/identity/me/onboarding", { method: "PATCH", body });
}

export function signOut(returnTo?: string) {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return apiRequest<{ ok: boolean }>(`/api/v1/auth/logout${query}`, { method: "POST" });
}

export function listUsers(includeInactive = false) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<{ users: IdentityUser[] }>(`/api/v1/identity/users${query}`);
}

export function getUser(id: string) {
  return apiRequest<IdentityUser>(`/api/v1/identity/users/${id}`);
}

export function getUserDetail(id: string) {
  return apiRequest<IdentityUserDetail>(`/api/v1/identity/users/${id}/detail`);
}

export function createUser(body: { email: string; role: UserRole; override_returning_warning?: boolean }) {
  return apiRequest<IdentityUser>("/api/v1/identity/users", { method: "POST", body });
}

export function updateUser(id: string, body: { role: UserRole }) {
  return apiRequest<IdentityUser>(`/api/v1/identity/users/${id}`, { method: "PATCH", body });
}

export function deactivateUser(id: string) {
  return apiRequest<{ id: string; deactivated_at: string | null; was_already_deactivated: boolean }>(
    `/api/v1/identity/users/${id}/deactivate`,
    { method: "POST" }
  );
}

export function listIdentityWorkflows() {
  return apiRequest<{ workflow_requests: IdentityWorkflowRequest[] }>("/api/v1/identity/workflow-requests");
}

export function createIdentityWorkflow(body: {
  action_code: "WF-064-IDENT-002";
  target_user: string;
  payload: Record<string, unknown>;
}) {
  return apiRequest<IdentityWorkflowRequest>("/api/v1/identity/workflow-requests", { method: "POST", body });
}

export function approveIdentityWorkflow(id: string, reason?: string) {
  return apiRequest<IdentityWorkflowRequest>(`/api/v1/identity/workflow-requests/${id}/approve`, {
    method: "POST",
    body: { reason },
  });
}

export function rejectIdentityWorkflow(id: string, reason?: string) {
  return apiRequest<IdentityWorkflowRequest>(`/api/v1/identity/workflow-requests/${id}/reject`, {
    method: "POST",
    body: { reason },
  });
}

export function listDispatcherSafetyEvents(userId: string, includeVoided = false) {
  const query = includeVoided ? "?include_voided=true" : "";
  return apiRequest<{ events: DispatcherSafetyEvent[] }>(`/api/v1/identity/users/${userId}/safety-events${query}`);
}

export function createDispatcherSafetyEvent(
  userId: string,
  body: {
    event_type: DispatcherErrorReason["event_type"];
    event_date: string;
    severity: DispatcherErrorReason["severity"];
    summary: string;
    details?: string;
    error_reason_id?: string;
    cost_amount?: number;
    cost_currency?: string;
    cost_recovered_amount?: number;
    cost_recovery_status?: "pending" | "partial" | "recovered" | "waived" | "absorbed";
    related_load_id?: string;
    related_customer_id?: string;
    related_driver_id?: string;
    document_ids?: string[];
  }
) {
  return apiRequest<{ event: DispatcherSafetyEvent }>(`/api/v1/identity/users/${userId}/safety-events`, { method: "POST", body });
}

export function voidDispatcherSafetyEvent(userId: string, eventId: string, voidReason: string) {
  return apiRequest<{ event: DispatcherSafetyEvent }>(`/api/v1/identity/users/${userId}/safety-events/${eventId}/void`, {
    method: "PATCH",
    body: { void_reason: voidReason },
  });
}

export function updateDispatcherSafetyEvent(
  userId: string,
  eventId: string,
  body: {
    details?: string | null;
    document_ids?: string[] | null;
    cost_recovery_status?: "pending" | "partial" | "recovered" | "waived" | "absorbed" | null;
    cost_recovered_amount?: number | null;
  }
) {
  return apiRequest<{ event: DispatcherSafetyEvent }>(`/api/v1/identity/users/${userId}/safety-events/${eventId}`, {
    method: "PATCH",
    body,
  });
}

export function checkReturningDispatcher(email: string) {
  return apiRequest<ReturningDispatcherDetectionResult>("/api/v1/identity/users/check-returning-dispatcher", {
    method: "POST",
    body: { email },
  });
}

export function listDispatcherErrorReasons(eventType?: DispatcherErrorReason["event_type"]) {
  const query = eventType ? `?event_type=${encodeURIComponent(eventType)}` : "";
  return apiRequest<{ reasons: DispatcherErrorReason[] }>(`/api/v1/catalogs/dispatcher-error-reasons${query}`);
}
