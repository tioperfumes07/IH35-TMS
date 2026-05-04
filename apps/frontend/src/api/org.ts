import { apiRequest } from "./client";

export type CompanyType = "asset_holder" | "operating_carrier";

export type MyCompany = {
  id: string;
  code: string;
  legal_name: string;
  short_name: string | null;
  company_type: CompanyType;
  is_active: boolean;
  is_default: boolean;
};

export function listMyCompanies() {
  return apiRequest<{ companies: MyCompany[] }>("/api/v1/org/me/companies");
}

export function setDefaultCompany(companyId: string) {
  return apiRequest<{ ok: true }>("/api/v1/org/me/default-company", {
    method: "PATCH",
    body: { company_id: companyId },
  });
}
