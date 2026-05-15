import { apiRequestFormData, resolveApiUrl } from "./client";

export type DataImportPreviewResponse = {
  valid_rows: number;
  invalid_rows: number;
  errors: Array<{ row: number; message: string }>;
  sample_valid: Record<string, string>[];
  all_invalid: Array<{ row: number; row_data: Record<string, string>; errors: string[] }>;
};

export type DataImportCommitResponse = {
  inserted_rows: number;
  skipped_rows: number;
  errors: Array<{ row: number; message: string }>;
};

export function buildDataImportUrl(params: { entityType: string; companyCode?: string; commit?: boolean }): string {
  const q = new URLSearchParams();
  q.set("entity_type", params.entityType);
  if (params.companyCode?.trim()) q.set("company_code", params.companyCode.trim().toUpperCase());
  if (params.commit) q.set("commit", "true");
  return `/api/v1/admin/data-import?${q.toString()}`;
}

export async function postDataImportMultipart(
  file: File,
  params: { entityType: string; companyCode?: string; commit?: boolean }
): Promise<DataImportPreviewResponse | DataImportCommitResponse> {
  const form = new FormData();
  form.set("file", file);
  return apiRequestFormData<DataImportPreviewResponse | DataImportCommitResponse>(
    buildDataImportUrl(params),
    form
  );
}

export function dataImportTemplateUrl(entityType: string): string {
  return resolveApiUrl(`/api/v1/admin/data-import/template/${encodeURIComponent(entityType)}`);
}
