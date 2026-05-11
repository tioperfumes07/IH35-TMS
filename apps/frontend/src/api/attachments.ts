import { apiRequest } from "./client";

export type AttachmentEntityType =
  | "load"
  | "work_order"
  | "bill"
  | "expense"
  | "invoice"
  | "payment"
  | "estimate"
  | "driver_charge"
  | "vendor_chargeback"
  | "customer_adjustment"
  | "damage_report"
  | "severe_repair"
  | "dispute"
  | "transfer"
  | "journal_entry"
  | "driver"
  | "customer"
  | "vendor"
  | "unit"
  | "equipment"
  | "manual";

export type AttachmentCategory =
  | "bol"
  | "pod"
  | "rate_confirmation"
  | "dispatch_instructions"
  | "accident_report"
  | "damage_photo"
  | "dvir"
  | "dot_inspection"
  | "antidoping_result"
  | "medical_card"
  | "cdl"
  | "permit"
  | "insurance_policy"
  | "claim"
  | "signed_acknowledgment"
  | "vendor_invoice"
  | "bank_statement"
  | "tax_form"
  | "legal_doc"
  | "check_image"
  | "ach_confirmation"
  | "wire_confirmation"
  | "deposit_slip"
  | "vendor_estimate"
  | "vendor_ro"
  | "receipt"
  | "other";

export type AttachmentRow = {
  id: string;
  entity_type: AttachmentEntityType;
  entity_id: string;
  category: AttachmentCategory;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

function withCompany(path: string, operatingCompanyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export function createAttachmentUploadUrl(body: {
  operating_company_id: string;
  entity_type: AttachmentEntityType;
  entity_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}) {
  return apiRequest<{ attachment_id: string; upload_url: string; expires_in_seconds: number; r2_object_key: string }>("/api/v1/attachments/upload-url", {
    method: "POST",
    body,
  });
}

export function finalizeAttachment(
  attachmentId: string,
  body: { operating_company_id: string; sha256_hash: string; category: AttachmentCategory }
) {
  return apiRequest<{ id: string; deduped: boolean }>(`/api/v1/attachments/${attachmentId}/finalize`, {
    method: "POST",
    body,
  });
}

export function listAttachments(params: { operating_company_id: string; entity_type: AttachmentEntityType; entity_id: string }) {
  const query = new URLSearchParams({
    operating_company_id: params.operating_company_id,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
  });
  return apiRequest<{ rows: AttachmentRow[] }>(`/api/v1/attachments?${query.toString()}`);
}

export function getAttachmentDownloadUrl(attachmentId: string, operatingCompanyId: string) {
  return apiRequest<{ id: string; download_url: string; expires_in_seconds: number }>(
    withCompany(`/api/v1/attachments/${attachmentId}/download-url`, operatingCompanyId)
  );
}

export function deleteAttachment(attachmentId: string, operatingCompanyId: string) {
  return apiRequest<{ id: string }>(withCompany(`/api/v1/attachments/${attachmentId}`, operatingCompanyId), { method: "DELETE" });
}

export function parseRateConfirmationFromAttachment(attachmentId: string, operatingCompanyId: string) {
  return apiRequest<{
    parsed: {
      confidence_score: number;
      customer_name_raw: string;
      customer_id: string | null;
      origin_city: string;
      origin_state: string;
      destination_city: string;
      destination_state: string;
      pickup_date: string;
      delivery_date: string;
      rate_cents: number;
      load_number_external: string;
      raw_extraction: Record<string, unknown>;
    };
  }>(withCompany(`/api/v1/ocr/rate-confirmation/${attachmentId}`, operatingCompanyId), { method: "POST" });
}
