// DOC-REQ-2 — required-document-types config client. Read for any authed user; writes are Owner/Administrator
// (matches the backend route gate + the table's write RLS policy). No money, no posting.
import { apiRequest } from "./client";

export type RequiredDocEntityKind = "driver" | "unit" | "customer" | "vendor";
export type RequiredDocEnforcement = "warn" | "hard_block";

export type RequiredDocumentType = {
  id: string;
  entity_kind: RequiredDocEntityKind;
  code: string;
  label: string;
  authority: string | null;
  enforcement: RequiredDocEnforcement;
  has_expiry: boolean;
  is_seed: boolean;
  sort_order: number;
};

export async function listRequiredDocumentTypes(
  operating_company_id: string,
  entity_kind?: RequiredDocEntityKind
): Promise<RequiredDocumentType[]> {
  const params = new URLSearchParams({ operating_company_id });
  if (entity_kind) params.set("entity_kind", entity_kind);
  const res = await apiRequest<{ required_document_types: RequiredDocumentType[] }>(
    `/api/v1/compliance/required-document-types?${params}`
  );
  return res.required_document_types;
}

export async function createRequiredDocumentType(input: {
  operating_company_id: string;
  entity_kind: RequiredDocEntityKind;
  code: string;
  label: string;
  authority?: string;
  enforcement?: RequiredDocEnforcement;
  has_expiry?: boolean;
  sort_order?: number;
}): Promise<RequiredDocumentType> {
  const res = await apiRequest<{ required_document_type: RequiredDocumentType }>(
    `/api/v1/compliance/required-document-types`,
    { method: "POST", body: input }
  );
  return res.required_document_type;
}

export async function updateRequiredDocumentType(
  id: string,
  input: {
    operating_company_id: string;
    label?: string;
    authority?: string;
    enforcement?: RequiredDocEnforcement;
    has_expiry?: boolean;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<RequiredDocumentType> {
  const res = await apiRequest<{ required_document_type: RequiredDocumentType }>(
    `/api/v1/compliance/required-document-types/${id}`,
    { method: "PATCH", body: input }
  );
  return res.required_document_type;
}
