import { apiRequest } from "./client";

export type IftaPreparation = {
  id: string;
  operating_company_id: string;
  quarter: number;
  year: number;
  status: string;
  miles_aggregated_at?: string | null;
  gallons_aggregated_at?: string | null;
  state_miles?: Array<{ state: string; miles: number; source: string; override_miles?: number | null }>;
  state_gallons?: Array<{
    state: string;
    gallons: number;
    source: string;
    override_gallons?: number | null;
    source_records?: Array<{ source: string; gallons: number; count?: number }>;
  }>;
};

function withCompany(path: string, operatingCompanyId: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export function createIftaPreparation(operatingCompanyId: string, body: { quarter: number; year: number }) {
  return apiRequest<IftaPreparation>(withCompany("/api/v1/ifta/preparations", operatingCompanyId), {
    method: "POST",
    body,
  });
}

export function getIftaPreparation(operatingCompanyId: string, preparationId: string) {
  return apiRequest<IftaPreparation>(withCompany(`/api/v1/ifta/preparations/${preparationId}`, operatingCompanyId));
}

export function runIftaAggregateMiles(operatingCompanyId: string, preparationId: string) {
  return apiRequest<{ rows: unknown[]; total_miles: number }>(
    withCompany(`/api/v1/ifta/preparations/${preparationId}/aggregate-miles`, operatingCompanyId),
    { method: "POST", body: {} }
  );
}

export function runIftaAggregateGallons(operatingCompanyId: string, preparationId: string) {
  return apiRequest<{ rows: unknown[]; total_gallons: number }>(
    withCompany(`/api/v1/ifta/preparations/${preparationId}/aggregate-gallons`, operatingCompanyId),
    { method: "POST", body: {} }
  );
}
