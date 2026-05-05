import { apiRequest, ApiError } from "./client";

export type DriverFileEntityType = "driver" | "load" | "standalone";
type ApiFileEntityType = "driver" | "customer" | "vendor" | "unit" | "equipment" | "load" | "settlement" | "invoice";

export type FileCategory = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  applies_to: Array<"driver" | "customer" | "vendor" | "unit" | "equipment" | "load" | "settlement" | "invoice" | "standalone">;
  requires_expiration_date: boolean;
  is_active: boolean;
};

export type DocsFile = {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  category_id: string | null;
  category_label?: string | null;
  document_date: string | null;
  expiration_date: string | null;
  description: string | null;
  version_number: number;
  created_at: string;
  uploader_user_id: string;
  uploader_email?: string | null;
  upload_completed_at: string | null;
};

export function listFileCategories(appliesTo?: FileCategory["applies_to"][number]) {
  const query = new URLSearchParams();
  if (appliesTo) query.set("applies_to", appliesTo);
  const qs = query.toString();
  return apiRequest<{ categories: FileCategory[] }>(`/api/v1/catalogs/file-categories${qs ? `?${qs}` : ""}`);
}

export function requestUploadUrl(payload: {
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  category_id?: string | null;
  entity_links?: Array<{ entity_type: ApiFileEntityType; entity_id: string }>;
}) {
  return apiRequest<{
    file_id: string;
    presigned_url: string;
    expires_at: string;
  }>("/api/v1/docs/files/upload-url", { method: "POST", body: payload });
}

export function confirmUpload(fileId: string) {
  return apiRequest<{ ok: true; file_id: string }>(`/api/v1/docs/files/${fileId}/upload-complete`, { method: "POST" });
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

export function listFiles(filters: Partial<{ entity_type: ApiFileEntityType; entity_id: string; limit: number; offset: number }> = {}) {
  const clean = (value: string | undefined) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
    return trimmed;
  };
  const query = new URLSearchParams();
  const entityType = clean(filters.entity_type);
  const entityId = clean(filters.entity_id);
  if (entityType) query.set("entity_type", entityType);
  if (entityId) query.set("entity_id", entityId);
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  const qs = query.toString();
  return apiRequest<{ files: DocsFile[]; total: number }>(`/api/v1/docs/files${qs ? `?${qs}` : ""}`);
}

export function getDownloadUrl(fileId: string) {
  return apiRequest<{ presigned_url: string }>(`/api/v1/docs/files/${fileId}/download-url`);
}

export async function uploadBlobToR2(presignedUrl: string, blob: Blob, contentType: string, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType || "application/octet-stream" },
      body: blob,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`r2_upload_failed:${response.status}`);
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

export function normalizeUploadError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 503) return "R2 not configured";
    if (error.status === 413) return "File too large";
    if (error.status === 403) return "Permission denied";
    return `API error ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return "Unknown upload error";
}
