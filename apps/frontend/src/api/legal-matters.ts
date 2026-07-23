import { apiRequest } from "./client";
import { resolveApiUrl } from "./client";

export type LegalMatterRow = Record<string, unknown>;

/** GET /legal/matters/:id payload rows for nested collections. */
export type LegalMatterEventRow = Record<string, unknown>;
export type LegalMatterDocumentRow = Record<string, unknown>;
export type LegalMatterDeadlineRow = Record<string, unknown>;

export type LegalMatterDetailPayload = {
  matter: LegalMatterRow;
  events: LegalMatterEventRow[];
  documents: LegalMatterDocumentRow[];
  deadlines: LegalMatterDeadlineRow[];
};

/** Aliases for UI / strict TS (CI frontend project references). */
export type LegalMatterEvent = LegalMatterEventRow;
export type LegalMatterDocument = LegalMatterDocumentRow;
export type LegalMatterDeadline = LegalMatterDeadlineRow;
export type LegalMatterListRow = LegalMatterRow;

function withCompany(path: string, operatingCompanyId: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ operating_company_id: operatingCompanyId, ...params });
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${search.toString()}`;
}

export const legalMattersApi = {
  list(
    operatingCompanyId: string,
    filters: {
      status?: string;
      severity?: string;
      type?: string;
      related_driver_id?: string;
      /** Filter legal.matters.unit_id (fleet reverse drill-through). */
      unit_id?: string;
      /** Filter legal.matters.insurance_claim_id (insurance reverse drill-through). */
      insurance_claim_id?: string;
    } = {}
  ) {
    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.severity) params.severity = filters.severity;
    if (filters.type) params.type = filters.type;
    if (filters.related_driver_id) params.related_driver_id = filters.related_driver_id;
    if (filters.unit_id) params.unit_id = filters.unit_id;
    if (filters.insurance_claim_id) params.insurance_claim_id = filters.insurance_claim_id;
    return apiRequest<{ matters: LegalMatterRow[] }>(withCompany("/api/v1/legal/matters", operatingCompanyId, params));
  },

  get(operatingCompanyId: string, id: string) {
    return apiRequest<LegalMatterDetailPayload>(
      withCompany(`/api/v1/legal/matters/${encodeURIComponent(id)}`, operatingCompanyId)
    );
  },

  create(operatingCompanyId: string, body: Record<string, unknown>) {
    return apiRequest<{ matter: LegalMatterRow }>(withCompany("/api/v1/legal/matters", operatingCompanyId), {
      method: "POST",
      body,
    });
  },

  update(operatingCompanyId: string, id: string, body: Record<string, unknown>) {
    return apiRequest<{ matter: LegalMatterRow }>(
      withCompany(`/api/v1/legal/matters/${encodeURIComponent(id)}`, operatingCompanyId),
      { method: "PATCH", body }
    );
  },

  close(operatingCompanyId: string, id: string, body: { outcome_summary: string }) {
    return apiRequest<{ matter: LegalMatterRow }>(
      withCompany(`/api/v1/legal/matters/${encodeURIComponent(id)}/close`, operatingCompanyId),
      { method: "POST", body }
    );
  },

  addEvent(operatingCompanyId: string, id: string, body: { event_type: string; event_body?: Record<string, unknown> }) {
    return apiRequest<{ ok: boolean }>(
      withCompany(`/api/v1/legal/matters/${encodeURIComponent(id)}/events`, operatingCompanyId),
      { method: "POST", body }
    );
  },

  addDeadline(
    operatingCompanyId: string,
    id: string,
    body: {
      deadline_type: string;
      title: string;
      deadline_at: string;
      reminder_offset_days?: number;
      reminder_recipients?: string[];
    }
  ) {
    return apiRequest<{ deadline: Record<string, unknown> }>(
      withCompany(`/api/v1/legal/matters/${encodeURIComponent(id)}/deadlines`, operatingCompanyId),
      { method: "POST", body }
    );
  },

  completeDeadline(operatingCompanyId: string, matterId: string, deadlineId: string) {
    return apiRequest<{ deadline: Record<string, unknown> }>(
      withCompany(
        `/api/v1/legal/matters/${encodeURIComponent(matterId)}/deadlines/${encodeURIComponent(deadlineId)}/complete`,
        operatingCompanyId
      ),
      { method: "PATCH", body: {} }
    );
  },

  reportsSummary(operatingCompanyId: string) {
    return apiRequest<Record<string, unknown>>(withCompany("/api/v1/legal/matters/reports/summary", operatingCompanyId));
  },

  documentDownloadUrl(operatingCompanyId: string, matterId: string, documentId: string) {
    return withCompany(
      `/api/v1/legal/matters/${encodeURIComponent(matterId)}/documents/${encodeURIComponent(documentId)}/download`,
      operatingCompanyId
    );
  },
};

export async function uploadMatterDocument(
  operatingCompanyId: string,
  matterId: string,
  file: File,
  title: string,
  isPrivileged: boolean
) {
  const form = new FormData();
  form.append("title", title);
  form.append("is_privileged", isPrivileged ? "true" : "false");
  form.append("file", file);
  const path = withCompany(`/api/v1/legal/matters/${encodeURIComponent(matterId)}/documents`, operatingCompanyId);
  const url = path;
  const response = await fetch(resolveApiUrl(url), { method: "POST", body: form, credentials: "include" });
  const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload ? String((payload as { error: string }).error) : "upload_failed");
  return payload as { document: Record<string, unknown> };
}
