import { apiRequest } from "./client";
import type { DispatchLoad, DispatchLoadListQuery } from "./dispatch";
import type { DispatchLoadRow, LoadsListFilters, LoadsListResponse } from "./loads";

function encodeMulti(query: URLSearchParams, key: string, values?: string[]) {
  if (!values || values.length === 0) return;
  for (const value of values) query.append(key, value);
}

export function listDispatchLoads(query: DispatchLoadListQuery) {
  const params = new URLSearchParams();
  params.set("operating_company_id", query.operating_company_id);
  params.set("view", query.view);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  for (const status of query.status) params.append("status", status);
  if (query.customer) params.set("customer", query.customer);
  if (query.driver) params.set("driver", query.driver);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.search) params.set("search", query.search);
  return apiRequest<{ loads: DispatchLoad[]; total_count: number; has_more: boolean }>(`/api/v1/dispatch/loads?${params.toString()}`);
}

export async function listAllDispatchLoads(query: Omit<DispatchLoadListQuery, "limit" | "offset">) {
  const limit = 200;
  const loads: DispatchLoad[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;
  while (true) {
    const page = await listDispatchLoads({ ...query, limit, offset });
    if (expectedTotal == null) expectedTotal = page.total_count;
    if (page.total_count !== expectedTotal) throw new Error("Dispatch load population changed during pagination. Retry.");
    for (const load of page.loads) {
      if (!seen.has(load.id)) { seen.add(load.id); loads.push(load); }
    }
    if (offset + page.loads.length >= expectedTotal) return { loads, total_count: expectedTotal, has_more: false };
    if (page.loads.length === 0) throw new Error("Dispatch load pagination stopped before the reported total.");
    offset += page.loads.length;
  }
}

export function listLoads(filters: LoadsListFilters) {
  if (!filters.board_scope && !filters.drafts_only) {
    throw new Error(
      "listLoads requires board_scope (\"live\"|\"history\") or drafts_only — ROUND 283.3 fail-closed; status alone is not enough"
    );
  }
  const query = new URLSearchParams();
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.search) query.set("search", filters.search);
  if (filters.customer_id) query.set("customer_id", filters.customer_id);
  if (filters.driver_id) query.set("driver_id", filters.driver_id);
  if (filters.pickup_date_from) query.set("pickup_date_from", filters.pickup_date_from);
  if (filters.pickup_date_to) query.set("pickup_date_to", filters.pickup_date_to);
  if (filters.delivery_date_from) query.set("delivery_date_from", filters.delivery_date_from);
  if (filters.delivery_date_to) query.set("delivery_date_to", filters.delivery_date_to);
  encodeMulti(query, "status", filters.status);
  encodeMulti(query, "operating_company_id", filters.operating_company_id);
  if (filters.include_progress !== undefined) query.set("include_progress", String(filters.include_progress));
  if (filters.include_live_eta !== undefined) query.set("include_live_eta", String(filters.include_live_eta));
  if (filters.board_scope) query.set("board_scope", filters.board_scope);
  if (filters.include_open_tour_legs) query.set("include_open_tour_legs", "true");
  if (filters.drafts_only) query.set("drafts_only", "true");
  const qs = query.toString();
  return apiRequest<LoadsListResponse>(`/api/v1/mdata/loads${qs ? `?${qs}` : ""}`);
}

export async function listAllLoads(filters: Omit<LoadsListFilters, "limit" | "offset">) {
  const pageSize = 200;
  const loads: DispatchLoadRow[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;
  for (;;) {
    const page = await listLoads({ ...filters, limit: pageSize, offset });
    if (expectedTotal == null) expectedTotal = page.total_count;
    if (page.total_count !== expectedTotal) throw new Error("Load total changed during pagination. Retry.");
    for (const load of page.loads) {
      if (seen.has(load.id)) throw new Error("Load pagination returned a duplicate load. Retry.");
      seen.add(load.id);
      loads.push(load);
    }
    if (!page.has_more) break;
    if (page.loads.length === 0) throw new Error("Load pagination stopped before the reported total.");
    offset += page.loads.length;
  }
  if (loads.length !== (expectedTotal ?? 0)) {
    throw new Error(`Load pagination returned ${loads.length} of ${expectedTotal ?? 0} rows.`);
  }
  return { loads, total_count: expectedTotal ?? 0, has_more: false } as LoadsListResponse;
}
