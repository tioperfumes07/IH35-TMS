import { apiRequest } from "./client";

export type RelayPublicHealth = {
  is_configured: boolean;
  is_enabled: boolean;
  last_pull_at: string | null;
  last_health_status: "ok" | "auth_failed" | "not_configured" | "base_missing" | "error" | null;
  last_error: string | null;
};

function q(operatingCompanyId: string) {
  return `operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export async function getRelayHealth(operatingCompanyId: string): Promise<RelayPublicHealth> {
  return apiRequest<RelayPublicHealth>(`/api/integrations/relay/health?${q(operatingCompanyId)}`);
}

/** ROUND 443.29 c — the Relay wallet roll-forward: deposits − fills − fees = balance, by day, with the documents. */
export type RelayRollForwardDoc = { id: string; ref: string; cents: number };
export type RelayRollForwardDay = {
  day: string;
  deposits_cents: number;
  deposit_fees_cents: number;
  fills_cents: number;
  fill_fees_cents: number;
  lumper_cents: number;
  balance_cents: number;
  deposits: RelayRollForwardDoc[];
  fills: RelayRollForwardDoc[];
  lumper: RelayRollForwardDoc[];
};
export type RelayRollForward = {
  totals: { deposits_cents: number; deposit_fees_cents: number; fills_cents: number; fill_fees_cents: number; lumper_cents: number; balance_cents: number };
  days: RelayRollForwardDay[];
};

export async function getRelayWalletRollForward(operatingCompanyId: string): Promise<RelayRollForward> {
  return apiRequest<RelayRollForward>(`/api/integrations/relay/wallet-roll-forward?${q(operatingCompanyId)}`);
}
