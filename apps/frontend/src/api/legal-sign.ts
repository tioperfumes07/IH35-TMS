import { apiRequest } from "./client";

export type PublicLegalSignDetails = {
  contract_instance_id: string;
  template_code: string;
  template_version: number;
  display_name_en: string;
  display_name_es: string;
  signer_name: string;
  language: "en" | "es" | "bilingual";
  verification_channel: "none" | "sms" | "email";
  expires_at: string;
  content_html_en: string;
  content_html_es: string;
  filled_variables: Record<string, unknown>;
  requires_code: boolean;
};

export function getPublicLegalSignDetails(token: string) {
  return apiRequest<PublicLegalSignDetails>(`/api/v1/legal/sign/${encodeURIComponent(token)}`);
}

export function startPublicLegalSignVerification(token: string, channel?: "email" | "sms") {
  return apiRequest<{ ok: boolean; message?: string }>(`/api/v1/legal/sign/${encodeURIComponent(token)}/verify/start`, {
    method: "POST",
    body: channel ? { channel } : {},
  });
}

export function confirmPublicLegalSignVerification(token: string, code: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/legal/sign/${encodeURIComponent(token)}/verify/confirm`, {
    method: "POST",
    body: { code },
  });
}

export function completePublicLegalSign(
  token: string,
  payload: {
    signed_by_name: string;
    typed_signature: string;
    drawn_signature_svg: string;
    signer_language: "en" | "es" | "bilingual";
    accepted_terms: true;
  }
) {
  return apiRequest<{
    ok: boolean;
    contract_instance_id: string;
    signature_id: string;
    signed_pdf_attachment_id: string;
  }>(`/api/v1/legal/sign/${encodeURIComponent(token)}/complete`, {
    method: "POST",
    body: payload,
  });
}
