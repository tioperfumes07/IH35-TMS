import { apiRequest } from "./client";

export type OfficeAuthUser = {
  id: string;
  email: string | null;
  role: string;
};

export async function officeEmailLogin(email: string, password: string) {
  return apiRequest<{ ok: boolean; user: OfficeAuthUser; session: { id: string } }>(`/api/v1/auth/office/email-login`, {
    method: "POST",
    body: { email, password },
  });
}

export async function requestPasswordReset(email: string) {
  return apiRequest<{ ok: boolean; message: string }>(`/api/v1/identity/password-reset/request`, {
    method: "POST",
    body: { email },
  });
}

export async function confirmPasswordReset(token: string, new_password: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/identity/password-reset/confirm`, {
    method: "POST",
    body: { token, new_password },
  });
}
