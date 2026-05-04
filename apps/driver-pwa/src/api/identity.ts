import { apiRequest } from "./client";

export type AuthMeResponse = {
  user: {
    uuid: string;
    email: string;
    role: string;
  };
  session: {
    id: string;
  };
};

export function getMe() {
  return apiRequest<AuthMeResponse>("/api/v1/auth/me");
}

export function signOut(returnTo?: string) {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return apiRequest<{ ok: boolean }>(`/api/v1/auth/logout${query}`, { method: "POST" });
}
