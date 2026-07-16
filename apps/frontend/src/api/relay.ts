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
