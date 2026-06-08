import { apiRequest } from "./client";

export type IftaFilingJurisdictionRow = {
  state: string;
  miles: number;
  fuel_gallons: number;
  tax_rate_per_gallon: number;
  taxable_gallons: number;
  net_taxable_gallons: number;
  tax_owed: number;
};

export type IftaFilingData = {
  quarter_label: string;
  year: number;
  quarter: number;
  miles_by_jurisdiction: Record<string, number>;
  fuel_by_jurisdiction: Record<string, number>;
  miles_overrides: Record<string, number>;
  fuel_overrides: Record<string, number>;
  jurisdiction_rows: IftaFilingJurisdictionRow[];
  fleet_mpg: number | null;
  total_tax_owed: number;
  rates_source: string;
  rates_quarter_key: string;
  prepared_at: string;
};

export type IftaFiling = {
  uuid: string;
  operating_company_id: string;
  quarter: string;
  status: "draft" | "review" | "owner_approved" | "filed";
  filing_data: IftaFilingData;
  prepared_by_user_uuid: string;
  approved_by_user_uuid?: string | null;
  approved_at?: string | null;
  filed_at?: string | null;
  confirmation_number?: string | null;
  created_at: string;
};

function withCompany(path: string, operatingCompanyId: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export function prepareIftaFiling(operatingCompanyId: string, quarter: string) {
  return apiRequest<IftaFiling>(withCompany("/api/v1/reports/ifta/prepare", operatingCompanyId), {
    method: "POST",
    body: { quarter },
  });
}

export function getIftaFilingDraft(operatingCompanyId: string, uuid: string) {
  return apiRequest<IftaFiling>(withCompany(`/api/v1/reports/ifta/draft/${uuid}`, operatingCompanyId));
}

export function updateIftaFilingOverrides(
  operatingCompanyId: string,
  uuid: string,
  body: { miles_overrides?: Record<string, number>; fuel_overrides?: Record<string, number> }
) {
  return apiRequest<IftaFiling>(withCompany(`/api/v1/reports/ifta/draft/${uuid}`, operatingCompanyId), {
    method: "PATCH",
    body,
  });
}

export function ownerApproveIftaFiling(
  operatingCompanyId: string,
  uuid: string,
  body: { wf064_confirm: true; confirm_phrase: "APPROVE"; hold_seconds_elapsed: number }
) {
  return apiRequest<IftaFiling>(withCompany(`/api/v1/reports/ifta/draft/${uuid}/owner-approve`, operatingCompanyId), {
    method: "POST",
    body,
  });
}

export function markIftaFilingFiled(operatingCompanyId: string, uuid: string, confirmationNumber: string) {
  return apiRequest<IftaFiling>(
    withCompany(`/api/v1/reports/ifta/draft/${uuid}/mark-filed`, operatingCompanyId),
    { method: "POST", body: { confirmation_number: confirmationNumber } }
  );
}

export function listIftaFilings(operatingCompanyId: string) {
  return apiRequest<{ filings: IftaFiling[] }>(withCompany("/api/v1/reports/ifta/filings", operatingCompanyId));
}
