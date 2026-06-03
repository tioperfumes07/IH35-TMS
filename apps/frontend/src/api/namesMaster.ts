import { apiRequest } from "./client";

export type NamesEntityType = "customer" | "vendor" | "driver" | "contact" | "company";

export type NamesMasterRow = {
  entity_type: NamesEntityType;
  entity_id: string;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  link_to_module_page: string;
  qbo_id: string | null;
  archived_at: string | null;
};

export type NamesMasterSearchResponse = {
  rows: NamesMasterRow[];
  total: number;
  limit: number;
  offset: number;
};

export type NamesMasterCountsResponse = {
  customers: number;
  vendors: number;
  drivers: number;
  contacts: number;
  total: number;
};

export function searchNamesMaster(args: {
  operatingCompanyId: string;
  q?: string;
  type?: "all" | NamesEntityType;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}) {
  const params = new URLSearchParams({
    operating_company_id: args.operatingCompanyId,
    q: args.q ?? "",
    type: args.type ?? "all",
    limit: String(args.limit ?? 50),
    offset: String(args.offset ?? 0),
    include_archived: String(args.includeArchived ?? false),
  });
  return apiRequest<NamesMasterSearchResponse>(`/api/v1/lists/names/search?${params.toString()}`);
}

export function getNamesMasterCounts(operatingCompanyId: string, includeArchived = false) {
  const params = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    include_archived: String(includeArchived),
  });
  return apiRequest<NamesMasterCountsResponse>(`/api/v1/lists/names/counts?${params.toString()}`);
}
