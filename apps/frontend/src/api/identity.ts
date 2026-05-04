import { apiRequest } from "./client";
import type { AuthMeResponse, IdentityUser, IdentityWorkflowRequest, UserRole } from "../types/api";

export function getMe() {
  return apiRequest<AuthMeResponse>("/api/v1/auth/me");
}

export function signOut(returnTo?: string) {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return apiRequest<{ ok: boolean }>(`/api/v1/auth/logout${query}`, { method: "POST" });
}

export function listUsers() {
  return apiRequest<{ users: IdentityUser[] }>("/api/v1/identity/users");
}

export function getUser(id: string) {
  return apiRequest<IdentityUser>(`/api/v1/identity/users/${id}`);
}

export function createUser(body: { email: string; role: UserRole }) {
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
