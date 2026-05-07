import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export type Form425CReport = Record<string, unknown> & {
  id: string;
  reporting_month: string;
  status: "draft" | "ready_to_file" | "filed" | "amended";
};

export function listForm425CReports(companyId: string) {
  return apiRequest<{ reports: Form425CReport[] }>(`/api/v1/form-425c?${q(companyId)}`);
}

export function getForm425CReport(id: string, companyId: string) {
  return apiRequest<{ report: Form425CReport; exhibit_a: Array<Record<string, unknown>>; exhibit_b: Array<Record<string, unknown>> }>(
    `/api/v1/form-425c/${id}?${q(companyId)}`
  );
}

export function createForm425CReport(
  companyId: string,
  payload: { reporting_month: string; case_number: string; court_district: string; subchapter?: "V" | "standard"; petition_date: string }
) {
  return apiRequest<Form425CReport>(`/api/v1/form-425c`, {
    method: "POST",
    body: { operating_company_id: companyId, ...payload },
  });
}

export function patchForm425CReport(id: string, companyId: string, payload: Record<string, unknown>) {
  return apiRequest<Form425CReport>(`/api/v1/form-425c/${id}`, {
    method: "PATCH",
    body: { operating_company_id: companyId, ...payload },
  });
}

export function getForm425CBankingSummary(companyId: string, month: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/form-425c/banking-summary?${q(companyId)}&month=${encodeURIComponent(month)}`);
}

export function importForm425CBanking(id: string, companyId: string) {
  return apiRequest<Form425CReport>(`/api/v1/form-425c/${id}/import-banking`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function generateForm425CPdf(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/form-425c/${id}/generate-filing-pdf`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function markForm425CFiled(id: string, companyId: string) {
  return apiRequest<Form425CReport>(`/api/v1/form-425c/${id}/mark-filed`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function amendForm425CReport(id: string, companyId: string) {
  return apiRequest<Form425CReport>(`/api/v1/form-425c/${id}/amend`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function addForm425CExhibitA(id: string, companyId: string, lineNumber: number, explanation: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/form-425c/${id}/exhibit-a`, {
    method: "POST",
    body: { operating_company_id: companyId, line_number: lineNumber, explanation },
  });
}

export function addForm425CExhibitB(id: string, companyId: string, lineNumber: number, explanation: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/form-425c/${id}/exhibit-b`, {
    method: "POST",
    body: { operating_company_id: companyId, line_number: lineNumber, explanation },
  });
}

export function attachForm425CLineFile(id: string, companyId: string, line: number, fileUuid: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/form-425c/${id}/attachments/${line}`, {
    method: "POST",
    body: { operating_company_id: companyId, file_uuid: fileUuid },
  });
}
