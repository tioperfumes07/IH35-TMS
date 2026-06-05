import { apiRequest } from "./client";

export type IftaPreparation = {
  id: string;
  operating_company_id: string;
  quarter: number;
  year: number;
  status: string;
  miles_aggregated_at?: string | null;
  gallons_aggregated_at?: string | null;
  tax_calculated_at?: string | null;
  csv_generated_at?: string | null;
  csv_url?: string | null;
  submitted_at?: string | null;
  state_miles?: Array<{ state: string; miles: number; source: string; override_miles?: number | null }>;
  state_gallons?: Array<{
    state: string;
    gallons: number;
    source: string;
    override_gallons?: number | null;
    source_records?: Array<{ source: string; gallons: number; count?: number }>;
  }>;
  state_taxes?: Array<{
    state: string;
    miles_in_state: number;
    taxable_gallons: number;
    gallons_purchased_in_state: number;
    net_taxable_gallons: number;
    tax_rate_per_gallon: number;
    tax_owed: number;
    mpg_in_state?: number | null;
    calculated_at?: string | null;
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

export function runIftaCalculateTax(operatingCompanyId: string, preparationId: string) {
  return apiRequest<{ rows: unknown[]; fleet_mpg: number | null; total_tax_owed: number }>(
    withCompany(`/api/v1/ifta/preparations/${preparationId}/calculate-tax`, operatingCompanyId),
    { method: "POST", body: {} }
  );
}

export function generateIftaCsv(operatingCompanyId: string, preparationId: string) {
  return apiRequest<{ download_url: string; csv_object_key: string; expires_in_seconds: number }>(
    withCompany(`/api/v1/ifta/preparations/${preparationId}/generate-csv`, operatingCompanyId),
    { method: "POST", body: {} }
  );
}

export function submitIftaPreparation(operatingCompanyId: string, preparationId: string) {
  return apiRequest<IftaPreparation>(withCompany(`/api/v1/ifta/preparations/${preparationId}/submit`, operatingCompanyId), {
    method: "POST",
    body: {},
  });
}
