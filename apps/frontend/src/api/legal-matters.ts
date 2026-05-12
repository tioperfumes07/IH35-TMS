import { apiRequest } from "./client";

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
  list(operatingCompanyId: string, filters: { status?: string; severity?: string; type?: string; related_driver_id?: string } = {}) {
    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.severity) params.severity = filters.severity;
    if (filters.type) params.type = filters.type;
    if (filters.related_driver_id) params.related_driver_id = filters.related_driver_id;
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
  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const url = API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, "")}${path}` : new URL(path, window.location.origin).toString();
  const response = await fetch(url, { method: "POST", body: form, credentials: "include" });
  const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload ? String((payload as { error: string }).error) : "upload_failed");
  return payload as { document: Record<string, unknown> };
}
