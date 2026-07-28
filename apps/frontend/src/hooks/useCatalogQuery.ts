import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestFormData } from "../api/client";

export type CatalogFieldType = "text" | "number" | "boolean" | "date" | "enum" | "foreign_key";

export type CatalogFieldConfig = {
  key: string;
  label: string;
  type: CatalogFieldType;
  required?: boolean;
  readOnlyOnEdit?: boolean;
  placeholder?: string;
  enumOptions?: Array<{ value: string; label: string }>;
  foreignKey?: {
    catalogName: string;
    labelField: string;
    valueField: string;
  };
};

export type CatalogColumnConfig = {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
};

export type CatalogSortConfig = {
  column: string;
  dir: "asc" | "desc";
};

export type CatalogRow = {
  id: string;
  code?: string;
  display_name?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type CatalogListResponse = {
  rows: CatalogRow[];
  total: number;
};

export type CatalogListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

export type ExcelUploadJob = {
  id: string;
  catalog_name: string;
  file_url?: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  rows_total: number;
  rows_succeeded: number;
  rows_failed: number;
  error_log: Array<{ row: number; reason: string; data?: Record<string, unknown> }>;
  started_at: string;
  completed_at: string | null;
};

export type GenericCatalogDefinition = {
  catalogName: string;
  displayName: string;
  domain: string;
  catalogKey: string;
  readOnly?: boolean;
  columns: CatalogColumnConfig[];
  fields: CatalogFieldConfig[];
  defaultSort: CatalogSortConfig;
};

/** Factory-registered catalogs (CATALOG-1 backend). Extend as catalogs migrate. */
export const GENERIC_CATALOG_REGISTRY: Record<string, GenericCatalogDefinition> = {
  // LST-A-01: registered so the generic catalog page can serve them. Column shape and both enums read
  // from prod 2026-07-28 and mirrored from the live CHECK constraints — these use `label`, not
  // display_name, and event_type/severity are NOT NULL with a fixed domain.
  "dispatch.dispatcher_error_reasons": {
    catalogName: "dispatch.dispatcher_error_reasons",
    displayName: "Dispatcher Error Reasons",
    domain: "dispatch",
    catalogKey: "dispatcher-error-reasons",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "label", label: "Label", sortable: true, filterable: true },
      { key: "event_type", label: "Event Type", sortable: true, filterable: true },
      { key: "severity", label: "Severity", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "label", label: "Label", type: "text", required: true },
      { key: "event_type", label: "Event Type", type: "enum", required: true,
        enumOptions: [{ value: "customer_complaint", label: "Customer Complaint" }, { value: "missed_appointment", label: "Missed Appointment" }, { value: "unpaid_invoice_responsibility", label: "Unpaid Invoice Responsibility" }, { value: "abandoned_load_dispatcher_fault", label: "Abandoned Load Dispatcher Fault" }, { value: "rate_below_threshold_unjustified", label: "Rate Below Threshold Unjustified" }, { value: "driver_complaint_validated", label: "Driver Complaint Validated" }, { value: "commendation", label: "Commendation" }, { value: "training_required", label: "Training Required" }, { value: "policy_violation", label: "Policy Violation" }, { value: "other", label: "Other" }] },
      { key: "severity", label: "Severity", type: "enum", required: true,
        enumOptions: [{ value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "severe", label: "Severe" }] },
      { key: "description", label: "Description", type: "text", required: false },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "customers.customer_quality_event_reasons": {
    catalogName: "customers.customer_quality_event_reasons",
    displayName: "Customer Quality Event Reasons",
    domain: "customers",
    catalogKey: "customer-quality-event-reasons",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "label", label: "Label", sortable: true, filterable: true },
      { key: "event_type", label: "Event Type", sortable: true, filterable: true },
      { key: "severity", label: "Severity", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "label", label: "Label", type: "text", required: true },
      { key: "event_type", label: "Event Type", type: "enum", required: true,
        enumOptions: [{ value: "late_payment", label: "Late Payment" }, { value: "non_payment", label: "Non Payment" }, { value: "lumper_dispute", label: "Lumper Dispute" }, { value: "detention_dispute", label: "Detention Dispute" }, { value: "tonu_dispute", label: "Tonu Dispute" }, { value: "load_cancelled", label: "Load Cancelled" }, { value: "rate_dispute", label: "Rate Dispute" }, { value: "damage_claim", label: "Damage Claim" }, { value: "commendation", label: "Commendation" }, { value: "other", label: "Other" }] },
      { key: "severity", label: "Severity", type: "enum", required: true,
        enumOptions: [{ value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "severe", label: "Severe" }] },
      { key: "description", label: "Description", type: "text", required: false },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "fleet.equipment_types": {
    catalogName: "fleet.equipment_types",
    displayName: "Equipment Types",
    domain: "fleet",
    catalogKey: "equipment-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Display Name", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Order", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Display Name", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: true },
      { key: "is_active", label: "Active", type: "boolean", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
};

const LEGACY_HAND_ROLLED_CATALOG_PAGES = new Set([
  "apps/frontend/src/pages/lists/fleet/EquipmentTypesListPage.tsx",
]);

export function getLegacyHandRolledCatalogPages(): ReadonlySet<string> {
  return LEGACY_HAND_ROLLED_CATALOG_PAGES;
}

export function catalogKeyToCatalogName(domain: string, catalogKey: string): string | null {
  const normalizedKey = catalogKey.replace(/-/g, "_");
  const candidate = `${domain}.${normalizedKey}`;
  if (GENERIC_CATALOG_REGISTRY[candidate]) return candidate;
  for (const def of Object.values(GENERIC_CATALOG_REGISTRY)) {
    if (def.domain === domain && def.catalogKey === catalogKey) return def.catalogName;
  }
  return null;
}

export function catalogNameToRoutePath(catalogName: string): string {
  const def = GENERIC_CATALOG_REGISTRY[catalogName];
  if (def) return `/lists/${def.domain}/${def.catalogKey}`;
  const [domain, table] = catalogName.split(".");
  const catalogKey = (table ?? "").replace(/_/g, "-");
  return `/lists/${domain}/${catalogKey}`;
}

export function catalogNameToApiBasePath(catalogName: string): string {
  const [domain, table] = catalogName.split(".");
  const segment = (table ?? "").replace(/_/g, "-");
  return `/api/v1/catalogs/${domain}/${segment}`;
}

function buildListQuery(filters: CatalogListFilters): string {
  const params = new URLSearchParams();
  params.set("operating_company_id", filters.operating_company_id);
  if (filters.search) params.set("search", filters.search);
  if (filters.is_active) params.set("is_active", filters.is_active);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.dir) params.set("dir", filters.dir);
  return params.toString();
}

export function listCatalogRows(catalogName: string, filters: CatalogListFilters) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogListResponse>(`${base}?${buildListQuery(filters)}`);
}

export function getCatalogRow(catalogName: string, id: string, operating_company_id: string) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogRow>(`${base}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`);
}

export function createCatalogRow(catalogName: string, operating_company_id: string, body: Record<string, unknown>) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogRow>(`${base}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
    method: "POST",
    body,
  });
}

export function updateCatalogRow(
  catalogName: string,
  id: string,
  operating_company_id: string,
  body: Record<string, unknown>
) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogRow>(`${base}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
    method: "PATCH",
    body,
  });
}

export function archiveCatalogRow(catalogName: string, id: string, operating_company_id: string) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<{ ok: true }>(`${base}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
    method: "DELETE",
  });
}

export function restoreCatalogRow(catalogName: string, id: string, operating_company_id: string) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogRow>(
    `${base}/${id}/restore?operating_company_id=${encodeURIComponent(operating_company_id)}`,
    { method: "POST" }
  );
}

export function importCatalogExcel(catalogName: string, operating_company_id: string, file: File) {
  const base = catalogNameToApiBasePath(catalogName);
  const formData = new FormData();
  formData.append("file", file);
  return apiRequestFormData<{ job_id: string }>(
    `${base}/import?operating_company_id=${encodeURIComponent(operating_company_id)}`,
    formData
  );
}

export function getExcelUploadJob(jobId: string) {
  return apiRequest<ExcelUploadJob>(`/api/v1/catalogs/excel-upload-jobs/${encodeURIComponent(jobId)}`);
}

export function catalogExportCsvUrl(catalogName: string, operating_company_id: string): string {
  const base = catalogNameToApiBasePath(catalogName);
  return `${base}/export.csv?operating_company_id=${encodeURIComponent(operating_company_id)}`;
}

type UseCatalogQueryOptions = {
  catalogName: string;
  companyId: string;
  search?: string;
  isActive?: "true" | "false" | "all";
  sort?: CatalogSortConfig;
  enabled?: boolean;
};

export function useCatalogQuery({
  catalogName,
  companyId,
  search,
  isActive = "true",
  sort,
  enabled = true,
}: UseCatalogQueryOptions) {
  const definition = GENERIC_CATALOG_REGISTRY[catalogName];
  const defaultSort = sort ?? definition?.defaultSort ?? { column: "sort_order", dir: "asc" as const };

  return useQuery({
    queryKey: ["catalog", catalogName, companyId, search, isActive, defaultSort.column, defaultSort.dir],
    queryFn: () =>
      listCatalogRows(catalogName, {
        operating_company_id: companyId,
        search: search || undefined,
        is_active: isActive,
        sort: defaultSort.column,
        dir: defaultSort.dir,
        limit: 200,
        offset: 0,
      }),
    enabled: enabled && Boolean(companyId),
  });
}

export function useCatalogMutations(catalogName: string, companyId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["catalog", catalogName] });
  };

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => createCatalogRow(catalogName, companyId, body),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateCatalogRow(catalogName, id, companyId, body),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveCatalogRow(catalogName, id, companyId),
    onSuccess: invalidate,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreCatalogRow(catalogName, id, companyId),
    onSuccess: invalidate,
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => importCatalogExcel(catalogName, companyId, file),
  });

  return {
    createMutation,
    updateMutation,
    archiveMutation,
    restoreMutation,
    importMutation,
  };
}

export function useExcelUploadJobQuery(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["catalog-excel-job", jobId],
    queryFn: () => getExcelUploadJob(jobId!),
    enabled: enabled && Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "completed" || status === "failed") return false;
      return 1500;
    },
  });
}
