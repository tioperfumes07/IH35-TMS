import { apiRequest } from "./client";

function withCompany(path: string, companyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(companyId)}`;
}

export type InternalFineReasonRow = {
  id: string;
  operating_company_id: string;
  reason_code: string;
  reason_name: string;
  default_amount: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type CivilFineTypeRow = {
  id: string;
  operating_company_id: string;
  code: string;
  display_name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CompanyViolationTypeRow = {
  id: string;
  operating_company_id: string;
  type_code: string;
  type_name: string;
  default_severity: number;
  amount_cents: number | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ComplaintSeverity = "low" | "medium" | "high" | "critical";

export type ComplaintTypeRow = {
  id: string;
  operating_company_id: string;
  type_code: string;
  type_name: string;
  default_severity: ComplaintSeverity | null;
  is_active: boolean;
};

type ListQuery = {
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
};

function buildListPath(basePath: string, companyId: string, query: ListQuery = {}) {
  const params = new URLSearchParams();
  params.set("operating_company_id", companyId);
  if (query.search) params.set("search", query.search);
  if (query.is_active) params.set("is_active", query.is_active);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  return `${basePath}?${params.toString()}`;
}

export function listInternalFineReasons(companyId: string, query: ListQuery = {}) {
  return apiRequest<{ rows: InternalFineReasonRow[]; total: number }>(
    buildListPath("/api/v1/catalogs/safety/internal-fine-reasons", companyId, query)
  );
}

export function getInternalFineReason(companyId: string, id: string) {
  return apiRequest<InternalFineReasonRow>(withCompany(`/api/v1/catalogs/safety/internal-fine-reasons/${id}`, companyId));
}

export function createInternalFineReason(
  companyId: string,
  body: Pick<InternalFineReasonRow, "reason_code" | "reason_name" | "default_amount" | "is_active">
) {
  return apiRequest<InternalFineReasonRow>(withCompany("/api/v1/catalogs/safety/internal-fine-reasons", companyId), {
    method: "POST",
    body,
  });
}

export function updateInternalFineReason(
  companyId: string,
  id: string,
  body: Partial<Pick<InternalFineReasonRow, "reason_code" | "reason_name" | "default_amount" | "is_active">>
) {
  return apiRequest<InternalFineReasonRow>(withCompany(`/api/v1/catalogs/safety/internal-fine-reasons/${id}`, companyId), {
    method: "PATCH",
    body,
  });
}

export function deactivateInternalFineReason(companyId: string, id: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/catalogs/safety/internal-fine-reasons/${id}`, companyId), {
    method: "DELETE",
  });
}

export function listCivilFineTypes(companyId: string, query: ListQuery = {}) {
  return apiRequest<{ rows: CivilFineTypeRow[]; total: number }>(buildListPath("/api/v1/catalogs/safety/civil-fine-types", companyId, query));
}

export function getCivilFineType(companyId: string, id: string) {
  return apiRequest<CivilFineTypeRow>(withCompany(`/api/v1/catalogs/safety/civil-fine-types/${id}`, companyId));
}

export function createCivilFineType(
  companyId: string,
  body: Pick<CivilFineTypeRow, "code" | "display_name" | "description" | "metadata" | "is_active" | "sort_order">
) {
  return apiRequest<CivilFineTypeRow>(withCompany("/api/v1/catalogs/safety/civil-fine-types", companyId), {
    method: "POST",
    body,
  });
}

export function updateCivilFineType(
  companyId: string,
  id: string,
  body: Partial<Pick<CivilFineTypeRow, "code" | "display_name" | "description" | "metadata" | "is_active" | "sort_order">>
) {
  return apiRequest<CivilFineTypeRow>(withCompany(`/api/v1/catalogs/safety/civil-fine-types/${id}`, companyId), {
    method: "PATCH",
    body,
  });
}

export function deactivateCivilFineType(companyId: string, id: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/catalogs/safety/civil-fine-types/${id}`, companyId), {
    method: "DELETE",
  });
}

export function listCompanyViolationTypes(companyId: string, query: ListQuery = {}) {
  return apiRequest<{ rows: CompanyViolationTypeRow[]; total: number }>(
    buildListPath("/api/v1/catalogs/safety/company-violation-types", companyId, query)
  );
}

export function getCompanyViolationType(companyId: string, id: string) {
  return apiRequest<CompanyViolationTypeRow>(withCompany(`/api/v1/catalogs/safety/company-violation-types/${id}`, companyId));
}

export function createCompanyViolationType(
  companyId: string,
  body: Pick<CompanyViolationTypeRow, "type_code" | "type_name" | "default_severity" | "amount_cents" | "is_active">
) {
  return apiRequest<CompanyViolationTypeRow>(withCompany("/api/v1/catalogs/safety/company-violation-types", companyId), {
    method: "POST",
    body,
  });
}

export function updateCompanyViolationType(
  companyId: string,
  id: string,
  body: Partial<Pick<CompanyViolationTypeRow, "type_code" | "type_name" | "default_severity" | "amount_cents" | "is_active">>
) {
  return apiRequest<CompanyViolationTypeRow>(withCompany(`/api/v1/catalogs/safety/company-violation-types/${id}`, companyId), {
    method: "PATCH",
    body,
  });
}

export function deactivateCompanyViolationType(companyId: string, id: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/catalogs/safety/company-violation-types/${id}`, companyId), {
    method: "DELETE",
  });
}

export function listComplaintTypes(companyId: string, query: ListQuery = {}) {
  return apiRequest<{ rows: ComplaintTypeRow[]; total: number }>(
    buildListPath("/api/v1/catalogs/safety/complaint-types", companyId, query)
  );
}

export function getComplaintType(companyId: string, id: string) {
  return apiRequest<ComplaintTypeRow>(withCompany(`/api/v1/catalogs/safety/complaint-types/${id}`, companyId));
}

export function createComplaintType(
  companyId: string,
  body: Pick<ComplaintTypeRow, "type_code" | "type_name" | "default_severity" | "is_active">
) {
  return apiRequest<ComplaintTypeRow>(withCompany("/api/v1/catalogs/safety/complaint-types", companyId), {
    method: "POST",
    body,
  });
}

export function updateComplaintType(
  companyId: string,
  id: string,
  body: Partial<Pick<ComplaintTypeRow, "type_code" | "type_name" | "default_severity" | "is_active">>
) {
  return apiRequest<ComplaintTypeRow>(withCompany(`/api/v1/catalogs/safety/complaint-types/${id}`, companyId), {
    method: "PATCH",
    body,
  });
}

export function deactivateComplaintType(companyId: string, id: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/catalogs/safety/complaint-types/${id}`, companyId), {
    method: "DELETE",
  });
}
