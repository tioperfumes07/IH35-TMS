import { apiRequest } from "./client";

export type DispatchCatalogRow = {
  id: string;
  operating_company_id: string;
  code: string;
  display_name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DispatchCatalogListResponse = {
  rows: DispatchCatalogRow[];
  total: number;
};

export type DispatchCatalogListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
};

export type DispatchCatalogCreateBody = {
  code: string;
  display_name: string;
  description?: string | null;
  sort_order?: number;
  metadata?: Record<string, unknown>;
};

export type DispatchCatalogUpdateBody = Partial<DispatchCatalogCreateBody> & {
  is_active?: boolean;
};

type DispatchCatalogListClient = {
  list: (filters: DispatchCatalogListFilters) => Promise<DispatchCatalogListResponse>;
};

/**
 * Exhaust a canonical dispatch catalog when the mounted consumer must offer every active row.
 * Pickers cannot honestly use a single bounded page: an omitted row is unreachable and its FK can
 * never reach the submit payload. Keep ordinary list pages paged; use this only for complete pickers.
 */
export async function listAllDispatchCatalogRows(
  client: DispatchCatalogListClient,
  filters: Omit<DispatchCatalogListFilters, "limit" | "offset">,
  pageSize = 200
): Promise<DispatchCatalogListResponse> {
  const rows: DispatchCatalogRow[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;

  while (expectedTotal === null || rows.length < expectedTotal) {
    const page = await client.list({ ...filters, limit: pageSize, offset });
    if (expectedTotal === null) expectedTotal = page.total;
    else if (page.total !== expectedTotal) throw new Error("Dispatch catalog changed while loading; retry the picker.");
    // DSP-F7286: an honest empty catalog is a complete result, not stalled pagination. The old
    // ordering tested page.rows.length first, so { rows: [], total: 0 } threw and every mounted
    // picker painted a false catalog failure/disabled control even though the scoped GET was 200.
    if (rows.length === expectedTotal) break;
    if (page.rows.length === 0) throw new Error("Dispatch catalog pagination stopped before the reported total.");

    for (const row of page.rows) {
      if (seen.has(row.id)) throw new Error("Dispatch catalog pagination returned a duplicate row.");
      seen.add(row.id);
      rows.push(row);
    }
    offset += page.rows.length;
  }

  if (rows.length !== expectedTotal) throw new Error("Dispatch catalog pagination exceeded the reported total.");
  return { rows, total: expectedTotal };
}

function buildQuery(filters: DispatchCatalogListFilters) {
  const query = new URLSearchParams();
  query.set("operating_company_id", filters.operating_company_id);
  if (filters.search) query.set("search", filters.search);
  if (filters.is_active) query.set("is_active", filters.is_active);
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  return query.toString();
}

export function resolveDispatchCatalogRowId(
  raw: string | undefined,
  rows: DispatchCatalogRow[]
): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const byId = rows.find((row) => row.id === value);
  if (byId) return byId.id;
  return rows.find((row) => row.code === value)?.id;
}

export function createDispatchCatalogClient(catalogPath: "load-types" | "detention-reasons" | "pickup-time-types" | "additional-charges" | "lumper-providers" | "load-trailer-equipment") {
  const basePath = `/api/v1/catalogs/dispatch/${catalogPath}`;
  return {
    list: (filters: DispatchCatalogListFilters) =>
      apiRequest<DispatchCatalogListResponse>(`${basePath}?${buildQuery(filters)}`),
    get: (operatingCompanyId: string, id: string) =>
      apiRequest<DispatchCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    create: (operatingCompanyId: string, body: DispatchCatalogCreateBody) =>
      apiRequest<DispatchCatalogRow>(`${basePath}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "POST",
        body,
      }),
    update: (operatingCompanyId: string, id: string, body: DispatchCatalogUpdateBody) =>
      apiRequest<DispatchCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "PATCH",
        body,
      }),
    deactivate: (operatingCompanyId: string, id: string) =>
      apiRequest<DispatchCatalogRow>(`${basePath}/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
        method: "DELETE",
      }),
  };
}

export const loadTypesCatalogClient = createDispatchCatalogClient("load-types");
export const detentionReasonsCatalogClient = createDispatchCatalogClient("detention-reasons");
export const pickupTimeTypesCatalogClient = createDispatchCatalogClient("pickup-time-types");
export const additionalChargesCatalogClient = createDispatchCatalogClient("additional-charges");
export const lumperProvidersCatalogClient = createDispatchCatalogClient("lumper-providers");
export const loadTrailerEquipmentCatalogClient = createDispatchCatalogClient("load-trailer-equipment");
