import { apiRequest } from "./client";

export type AuthMeResponse = {
  user: {
    uuid: string;
    full_name?: string | null;
    email: string | null;
    role: string;
  };
  session: {
    id: string;
  };
};

export type PhoneStartResponse = {
  ok: true;
  channel: "whatsapp" | "sms";
  message: string;
};

export type PhoneVerifyResponse = {
  ok: true;
  user: {
    id: string;
    email: string | null;
    role: string;
  };
  session: { id: string };
};

export type InviteRedeemResponse = {
  ok: true;
  user: {
    id: string;
    email: string | null;
    role: string;
  };
  session: { id: string };
  driver_id: string;
};

export function getMe() {
  return apiRequest<AuthMeResponse>("/api/v1/auth/me");
}

export function signOut(returnTo?: string) {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return apiRequest<{ ok: boolean }>(`/api/v1/auth/logout${query}`, { method: "POST" });
}

export function startPhoneLogin(body: { phone: string; channel?: "whatsapp" | "sms" }) {
  return apiRequest<PhoneStartResponse>("/api/v1/auth/phone/start", { method: "POST", body });
}

export function verifyPhoneLogin(body: { phone: string; code: string }) {
  return apiRequest<PhoneVerifyResponse>("/api/v1/auth/phone/verify", { method: "POST", body });
}

export function redeemDriverInvite(body: { token: string }) {
  return apiRequest<InviteRedeemResponse>("/api/v1/auth/invite/redeem", { method: "POST", body });
}
