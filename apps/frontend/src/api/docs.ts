import { apiRequest } from "./client";

export type FileEntityType = "driver" | "customer" | "vendor" | "unit" | "equipment" | "load" | "settlement" | "invoice";

export type FileCategory = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  applies_to: Array<"driver" | "customer" | "vendor" | "unit" | "equipment" | "load" | "settlement" | "invoice" | "standalone">;
  typical_expiration_months: number | null;
  requires_expiration_date: boolean;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocsFileLink = {
  id: string;
  file_id?: string;
  entity_type: FileEntityType;
  entity_id: string;
  created_at: string;
  created_by_user_id: string;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
};

export type DocsFile = {
  id: string;
  operating_company_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256_hash: string | null;
  r2_bucket: string;
  r2_key: string;
  upload_completed_at: string | null;
  category_id: string | null;
  category_code?: string | null;
  category_label?: string | null;
  document_date: string | null;
  expiration_date: string | null;
  description: string | null;
  parent_file_id: string | null;
  version_number: number;
  uploader_user_id: string;
  uploader_email?: string | null;
  upload_ip_address: string | null;
  upload_user_agent: string | null;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
  delete_reason: string | null;
  created_at: string;
  updated_at: string;
  links?: DocsFileLink[];
};

export function requestUploadUrl(payload: {
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256_hash?: string;
  category_id?: string;
  entity_links?: Array<{ entity_type: FileEntityType; entity_id: string }>;
}) {
  return apiRequest<{
    file_id: string;
    presigned_url: string;
    r2_key: string;
    expires_at: string;
  }>("/api/v1/docs/files/upload-url", {
    method: "POST",
    body: payload,
  });
}

export function confirmUpload(fileId: string) {
  return apiRequest<{ ok: true; file_id: string; already_completed: boolean }>(`/api/v1/docs/files/${fileId}/upload-complete`, {
    method: "POST",
  });
}

export function listFiles(filters: Partial<{
  entity_type: FileEntityType;
  entity_id: string;
  category: string;
  include_deleted: boolean;
  include_incomplete: boolean;
  limit: number;
  offset: number;
}> = {}) {
  const clean = (value: string | undefined) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
    return trimmed;
  };

  const query = new URLSearchParams();
  const entityType = clean(filters.entity_type);
  const entityId = clean(filters.entity_id);
  const category = clean(filters.category);

  if (entityType) query.set("entity_type", entityType);
  if (entityId) query.set("entity_id", entityId);
  if (category) query.set("category", category);
  if (filters.include_deleted !== undefined) query.set("include_deleted", String(filters.include_deleted));
  if (filters.include_incomplete !== undefined) query.set("include_incomplete", String(filters.include_incomplete));
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  const qs = query.toString();
  return apiRequest<{ files: DocsFile[]; total: number; limit: number; offset: number }>(`/api/v1/docs/files${qs ? `?${qs}` : ""}`);
}

export function getFile(fileId: string) {
  return apiRequest<{ file: DocsFile; links: DocsFileLink[]; versions: Array<Partial<DocsFile>> }>(`/api/v1/docs/files/${fileId}`);
}

export function getDownloadUrl(fileId: string) {
  return apiRequest<{ presigned_url: string; expires_at: string; original_filename: string }>(`/api/v1/docs/files/${fileId}/download-url`);
}

export function updateFileMetadata(
  fileId: string,
  payload: Partial<{
    category_id: string | null;
    document_date: string | null;
    expiration_date: string | null;
    description: string | null;
  }>
) {
  return apiRequest<DocsFile>(`/api/v1/docs/files/${fileId}`, { method: "PATCH", body: payload });
}

export function linkFile(fileId: string, entityType: FileEntityType, entityId: string) {
  return apiRequest<{ link: DocsFileLink }>(`/api/v1/docs/files/${fileId}/links`, {
    method: "POST",
    body: { entity_type: entityType, entity_id: entityId },
  });
}

export function unlinkFile(fileId: string, linkId: string) {
  return apiRequest<{ ok: true; link_id: string }>(`/api/v1/docs/files/${fileId}/links/${linkId}`, {
    method: "DELETE",
  });
}

export function softDeleteFile(fileId: string, deleteReason: string) {
  return apiRequest<{ ok: true; file_id: string }>(`/api/v1/docs/files/${fileId}`, {
    method: "DELETE",
    body: { delete_reason: deleteReason },
  });
}

export function restoreFile(fileId: string) {
  return apiRequest<{ ok: true; file_id: string }>(`/api/v1/docs/files/${fileId}/restore`, {
    method: "POST",
  });
}

export function uploadNewVersion(
  fileId: string,
  payload: { original_filename: string; mime_type: string; size_bytes: number; sha256_hash?: string }
) {
  return apiRequest<{
    file_id: string;
    version_number: number;
    presigned_url: string;
    r2_key: string;
    expires_at: string;
  }>(`/api/v1/docs/files/${fileId}/versions`, {
    method: "POST",
    body: payload,
  });
}

export function listFileCategories(appliesTo?: FileCategory["applies_to"][number]) {
  const query = new URLSearchParams();
  if (appliesTo) query.set("applies_to", appliesTo);
  const qs = query.toString();
  return apiRequest<{ categories: FileCategory[] }>(`/api/v1/catalogs/file-categories${qs ? `?${qs}` : ""}`);
}

export function createFileCategory(payload: {
  code: string;
  label: string;
  description?: string;
  applies_to: FileCategory["applies_to"];
  typical_expiration_months?: number | null;
  requires_expiration_date?: boolean;
}) {
  return apiRequest<{ category: FileCategory }>("/api/v1/catalogs/file-categories", {
    method: "POST",
    body: payload,
  });
}

export async function uploadFileToR2(presignedUrl: string, file: File | Blob, contentType?: string) {
  const inferredContentType = ("type" in file ? file.type : "") || "application/octet-stream";
  const response = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType ?? inferredContentType,
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`r2_upload_failed:${response.status}`);
  }
  return true;
}
