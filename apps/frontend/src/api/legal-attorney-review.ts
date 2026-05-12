import { apiRequest } from "./client";

export type AttorneyReviewTemplateDetails = {
  template_id: string;
  template_code: string;
  version: number;
  display_name_en: string;
  display_name_es: string;
  category: string;
  status: string;
  submitted_for_review_at: string | null;
  content_html_en: string;
  content_html_es: string;
  requires_witness: boolean;
  variable_schema: unknown;
};

export function getPublicAttorneyReviewDetails(token: string) {
  return apiRequest<AttorneyReviewTemplateDetails>(`/api/v1/legal/attorney-review/${encodeURIComponent(token)}`);
}

export function attorneyPortalApprove(
  token: string,
  body: { attorney_name: string; bar_number: string; notes?: string }
) {
  return apiRequest<{ ok: true }>(`/api/v1/legal/attorney-review/${encodeURIComponent(token)}/approve`, {
    method: "POST",
    body,
  });
}

export function attorneyPortalRequestChanges(
  token: string,
  body: { attorney_name: string; bar_number: string; comments: string }
) {
  return apiRequest<{ ok: true }>(`/api/v1/legal/attorney-review/${encodeURIComponent(token)}/request-changes`, {
    method: "POST",
    body,
  });
}

export function attorneyPortalReject(token: string, body: { attorney_name: string; bar_number: string; comments: string }) {
  return apiRequest<{ ok: true }>(`/api/v1/legal/attorney-review/${encodeURIComponent(token)}/reject`, {
    method: "POST",
    body,
  });
}
