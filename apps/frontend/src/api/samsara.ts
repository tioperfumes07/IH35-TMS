import { apiRequest } from "./client";

export type SamsaraPublicHealth = {
  is_configured: boolean;
  is_enabled: boolean;
  last_health_status: string | null;
  last_health_check_at: string | null;
  last_error: string | null;
};

export type SamsaraOwnerConfig = SamsaraPublicHealth & {
  samsara_org_id: string | null;
};

function q(operatingCompanyId: string) {
  return `operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export async function getSamsaraHealth(operatingCompanyId: string): Promise<SamsaraPublicHealth> {
  return apiRequest<SamsaraPublicHealth>(`/api/v1/integrations/samsara/health?${q(operatingCompanyId)}`);
}

export async function getSamsaraOwnerConfig(operatingCompanyId: string): Promise<SamsaraOwnerConfig> {
  return apiRequest<SamsaraOwnerConfig>(`/api/v1/integrations/samsara/config?${q(operatingCompanyId)}`);
}

export async function saveSamsaraOwnerConfig(body: {
  operating_company_id: string;
  api_token: string;
  webhook_secret: string;
  samsara_org_id?: string | null;
}): Promise<SamsaraOwnerConfig> {
  return apiRequest<SamsaraOwnerConfig>("/api/v1/integrations/samsara/config", {
    method: "POST",
    body,
  });
}

export async function disableSamsaraIntegration(operatingCompanyId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/api/v1/integrations/samsara/config?${q(operatingCompanyId)}`, {
    method: "DELETE",
  });
}
