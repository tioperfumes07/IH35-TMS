import { apiRequest } from "./client";

export type FileEntityType =
  | "driver"
  | "customer"
  | "vendor"
  | "unit"
  | "equipment"
  | "load"
  | "settlement"
  | "invoice"
  | "medical_card"
  | "background_check"
  | "fine"
  | "company_violation"
  | "drug_test"
  | "hos_violation"
  | "dot_inspection"
  | "fuel_transaction"
  | "expense"
  | "bill";

export type FileCategory = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  applies_to: Array<FileEntityType | "standalone">;
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
  entity_label?: string | null;
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

export type DocsFoundationKpis = {
  total_docs: number;
  expiring_30_days: number;
  missing_required: number;
  recent_uploads: number;
};

export type DocsFoundationRow = {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  category_id: string | null;
  type: string | null;
  type_label: string | null;
  expiration_date: string | null;
  upload_completed_at: string | null;
  created_at: string;
  links: Array<{ entity_type: FileEntityType; entity_id: string; entity_label?: string | null }>;
};

export async function sha256HexOfFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function requestUploadUrl(payload: {
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256_hash?: string;
  category_id?: string;
  entity_links?: Array<{ entity_type: FileEntityType; entity_id: string }>;
  /** The active company to file the upload under. Pass this whenever the file will later be read scoped to a
   *  specific company (e.g. rate-con extract) — otherwise the server files it under the lowest-UUID company
   *  the user can access, and the scoped read 404s. Server verifies access before honoring it. */
  operating_company_id?: string;
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

/** LV-DOCS-FILES-NOT-HASHED — always hash the bytes the browser will PUT to R2 before minting the upload URL. */
export async function requestUploadUrlFromFile(
  file: File,
  options: Omit<
    Parameters<typeof requestUploadUrl>[0],
    "original_filename" | "mime_type" | "size_bytes" | "sha256_hash"
  > & {
    original_filename?: string;
    mime_type?: string;
  } = {},
) {
  const sha256_hash = await sha256HexOfFile(file);
  return requestUploadUrl({
    original_filename: options.original_filename ?? file.name,
    mime_type: options.mime_type ?? (file.type || "application/octet-stream"),
    size_bytes: file.size,
    sha256_hash,
    category_id: options.category_id,
    entity_links: options.entity_links,
    operating_company_id: options.operating_company_id,
  });
}

export function confirmUpload(fileId: string) {
  return apiRequest<{ ok: true; file_id: string; already_completed: boolean }>(`/api/v1/docs/files/${fileId}/upload-complete`, {
    method: "POST",
  });
}

export function listFiles(filters: { operating_company_id: string } & Partial<{
  entity_type: FileEntityType;
  entity_id: string;
  category: string;
  include_deleted: boolean;
  include_incomplete: boolean;
  limit: number;
  offset: number;
}>) {
  const clean = (value: string | undefined) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
    return trimmed;
  };

  const query = new URLSearchParams();
  if (filters.operating_company_id) query.set("operating_company_id", filters.operating_company_id);
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

/** Exhaust a stable scoped document population for surfaces that present complete histories. */
export async function listAllFiles(
  filters: { operating_company_id: string } & Partial<Omit<{
    entity_type: FileEntityType;
    entity_id: string;
    category: string;
    include_deleted: boolean;
    include_incomplete: boolean;
    limit: number;
    offset: number;
  }, "limit" | "offset">>,
) {
  const limit = 200;
  const files: DocsFile[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;
  while (true) {
    const page = await listFiles({ ...filters, limit, offset });
    if (expectedTotal == null) expectedTotal = page.total;
    if (page.total !== expectedTotal) throw new Error("Document history changed during pagination. Retry.");
    for (const file of page.files) {
      if (!seen.has(file.id)) {
        seen.add(file.id);
        files.push(file);
      }
    }
    if (files.length >= expectedTotal) return { files, total: expectedTotal, limit, offset: 0 };
    if (page.files.length === 0) throw new Error("Document history pagination stopped before the reported total.");
    offset += page.files.length;
  }
}

export function getDocsFoundationKpis(operatingCompanyId?: string | null) {
  const query = new URLSearchParams();
  if (operatingCompanyId) query.set("operating_company_id", operatingCompanyId);
  const qs = query.toString();
  return apiRequest<DocsFoundationKpis>(`/api/v1/docs/kpis${qs ? `?${qs}` : ""}`);
}

export function listDocsFoundation(filters: Partial<{
  type: string;
  entity: FileEntityType;
  expires_before: string;
  /** KPI drill-down — matches /docs/kpis missing_required predicate */
  missing_required: boolean;
  /** KPI drill-down — matches /docs/kpis recent_uploads (last 7 days) predicate */
  recent_uploads: boolean;
  page: number;
  limit: number;
  operating_company_id: string;
}> = {}) {
  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.entity) query.set("entity", filters.entity);
  if (filters.expires_before) query.set("expires_before", filters.expires_before);
  if (filters.missing_required === true) query.set("missing_required", "true");
  if (filters.recent_uploads === true) query.set("recent_uploads", "true");
  if (filters.page) query.set("page", String(filters.page));
  if (filters.limit) query.set("limit", String(filters.limit));
  if (filters.operating_company_id) query.set("operating_company_id", filters.operating_company_id);
  const qs = query.toString();
  return apiRequest<{ total: number; page: number; limit: number; rows: DocsFoundationRow[] }>(`/api/v1/docs${qs ? `?${qs}` : ""}`);
}

export function getDocsFoundationDetail(id: string, operatingCompanyId?: string | null) {
  const query = new URLSearchParams();
  if (operatingCompanyId) query.set("operating_company_id", operatingCompanyId);
  const qs = query.toString();
  return apiRequest<DocsFile>(`/api/v1/docs/${id}${qs ? `?${qs}` : ""}`);
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

export async function uploadNewVersion(
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

/** Same integrity rule as requestUploadUrlFromFile for version bumps. */
export async function uploadNewVersionFromFile(fileId: string, file: File) {
  const sha256_hash = await sha256HexOfFile(file);
  return uploadNewVersion(fileId, {
    original_filename: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    sha256_hash,
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
