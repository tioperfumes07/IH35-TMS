import { apiRequest, resolveApiUrl } from "./client";

export type LegalContractStatus = "draft" | "sent" | "viewed" | "signed_electronically" | "voided" | "expired";
export type LegalSignerType = "driver" | "employee" | "customer" | "vendor" | "other";
export type LegalContractLanguage = "en" | "es" | "bilingual";
export type LegalDeliveryChannel = "email" | "sms" | "whatsapp";
export type LegalVerificationChannel = "none" | "sms" | "email";

export type LegalContractSummary = {
  id: string;
  template_id: string | null;
  template_code: string;
  template_version: number;
  signer_type: LegalSignerType;
  signer_name: string;
  signer_email: string | null;
  signer_phone: string | null;
  language: LegalContractLanguage;
  status: LegalContractStatus;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  display_name_en: string | null;
  display_name_es: string | null;
};

export type LegalContractDetail = LegalContractSummary & {
  signer_entity_id: string | null;
  filled_variables: Record<string, unknown>;
  signed_pdf_storage_url: string | null;
  signed_pdf_sha256: string | null;
  signed_pdf_attachment_id: string | null;
  signatures: Array<{
    id: string;
    signed_by_name: string;
    typed_signature: string;
    signer_language: LegalContractLanguage;
    signer_ip: string | null;
    signed_at: string;
  }>;
  audit_log: Array<{
    id: number;
    event_type: string;
    event_payload: Record<string, unknown>;
    actor_user_id: string | null;
    actor_name: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  }>;
};

export type CreateLegalContractInput = {
  template_id?: string;
  template_code?: string;
  signer_type: LegalSignerType;
  signer_entity_id?: string;
  signer_name: string;
  signer_email?: string;
  signer_phone?: string;
  language: LegalContractLanguage;
  filled_variables?: Record<string, unknown>;
};

export type SendLegalContractInput = {
  verification_channel: LegalVerificationChannel;
  delivery_channel: LegalDeliveryChannel;
  expires_in_hours?: number;
  custom_message?: string;
};

function withCompany(path: string, operatingCompanyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

// --- Lease-to-Own creator (LEGAL-CONTRACT-CREATOR-01) ---
export type LeaseToOwnCompany = {
  id: string;
  code: string;
  legal_name: string;
  short_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
};
export type LeaseToOwnFleetUnit = {
  id: string;
  unit_number: string;
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  unit_type: string | null;
  owner_company_id: string | null;
  owner_label: string | null;
  currently_leased_to_company_id: string | null;
};

export const legalContractsApi = {
  list(input: { operating_company_id: string; status?: LegalContractStatus; search?: string }) {
    const params = new URLSearchParams();
    params.set("operating_company_id", input.operating_company_id);
    if (input.status) params.set("status", input.status);
    if (input.search) params.set("search", input.search);
    return apiRequest<{ contracts: LegalContractSummary[] }>(`/api/v1/legal/contracts?${params.toString()}`);
  },

  get(contractId: string, operatingCompanyId: string) {
    return apiRequest<LegalContractDetail>(withCompany(`/api/v1/legal/contracts/${contractId}`, operatingCompanyId));
  },

  // Absolute URL to the inline DRAFT PDF (watermarked, unsigned) of a SAVED instance. Open in a new
  // tab — the backend streams application/pdf and auth rides on the session cookie (credentials).
  draftPdfUrl(contractId: string, operatingCompanyId: string) {
    return resolveApiUrl(withCompany(`/api/v1/legal/contracts/${contractId}/draft-pdf`, operatingCompanyId));
  },

  create(operatingCompanyId: string, payload: CreateLegalContractInput) {
    return apiRequest<LegalContractDetail>(withCompany("/api/v1/legal/contracts", operatingCompanyId), {
      method: "POST",
      body: payload,
    });
  },

  send(contractId: string, operatingCompanyId: string, payload: SendLegalContractInput) {
    return apiRequest<{ sent: boolean; sent_at: string; signer_url: string }>(
      withCompany(`/api/v1/legal/contracts/${contractId}/send`, operatingCompanyId),
      {
        method: "POST",
        body: payload,
      }
    );
  },

  // Lease-to-Own: real backend routes (404 when LEGAL_CONTRACTS_ENABLED off). Save reuses create().
  leaseToOwnFleet(input: { operating_company_id: string; owner_company_id?: string }) {
    const params = new URLSearchParams();
    params.set("operating_company_id", input.operating_company_id);
    if (input.owner_company_id) params.set("owner_company_id", input.owner_company_id);
    return apiRequest<{ units: LeaseToOwnFleetUnit[]; seller_default: LeaseToOwnCompany | null }>(
      `/api/v1/legal/contracts/lease-to-own/fleet?${params.toString()}`
    );
  },

  ensureLeaseToOwnTemplate(operatingCompanyId: string) {
    return apiRequest<{
      template: { id: string; version: number; seeded: boolean };
      seller_default: LeaseToOwnCompany | null;
    }>("/api/v1/legal/contracts/lease-to-own/ensure-template", {
      method: "POST",
      body: { operating_company_id: operatingCompanyId },
    });
  },

  // Watermarked DRAFT preview (preview/print only — creates NO instance row).
  draftPreview(
    operatingCompanyId: string,
    payload: {
      template_id?: string;
      template_code?: string;
      language: LegalContractLanguage;
      filled_variables?: Record<string, unknown>;
    }
  ) {
    return apiRequest<{ template_code: string; template_version: number; html: string }>(
      withCompany("/api/v1/legal/contracts/draft-preview", operatingCompanyId),
      { method: "POST", body: payload }
    );
  },

  // Idempotently seed the 7 owner-activated library templates for this entity.
  ensureLibrary(operatingCompanyId: string) {
    return apiRequest<{ total: number; inserted: number; already_present: number }>(
      withCompany("/api/v1/legal/templates/library/ensure", operatingCompanyId),
      { method: "POST", body: {} }
    );
  },
};
