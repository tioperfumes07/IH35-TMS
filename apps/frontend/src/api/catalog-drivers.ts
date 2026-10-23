import { apiRequest } from "./client";
import { filterHumanDrivers } from "../lib/driver-pseudo-user";
import type { Driver } from "../types/api";

export type ListDriversParams = {
  status?: string;
  search?: string;
  operating_company_id: string | null | undefined;
  include_system?: boolean;
  include_deactivated?: boolean;
  limit?: number;
  offset?: number;
  /** Rule 49 default is movement; Book Load / assign pickers use hr_status (443.257). */
  active_definition?: "movement" | "hr_status";
  /** Attach usual truck / last load / open load for picker sublabels (443.257). */
  enrich_picker?: boolean;
};

export function listDrivers(params: ListDriversParams) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "All") {
    const statusValue = params.status === "Suspended" ? "Inactive" : params.status;
    query.set("status", statusValue);
  }
  if (params.search) query.set("search", params.search);
  if (params.operating_company_id) query.set("operating_company_id", params.operating_company_id);
  if (params.include_system) query.set("include_system", "true");
  if (params.include_deactivated) query.set("include_deactivated", "true");
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  if (params.active_definition) query.set("active_definition", params.active_definition);
  if (params.enrich_picker) query.set("enrich_picker", "true");
  const qs = query.toString();
  return apiRequest<{ drivers: Driver[]; total?: number }>(`/api/v1/mdata/drivers${qs ? `?${qs}` : ""}`).then((payload) => ({
    drivers: params.include_system ? payload.drivers : filterHumanDrivers(payload.drivers),
    total: payload.total ?? payload.drivers.length,
  }));
}

export async function listAllDrivers(params: Omit<ListDriversParams, "limit" | "offset">) {
  const pageSize = 200;
  const first = await listDrivers({ ...params, limit: pageSize, offset: 0 });
  const expected = first.total ?? first.drivers.length;
  const drivers = [...first.drivers];
  let covered = pageSize;
  const maxPages = 500;
  for (let pageIndex = 1; covered < expected && pageIndex < maxPages; pageIndex += 1) {
    const next = await listDrivers({ ...params, limit: pageSize, offset: pageIndex * pageSize });
    drivers.push(...next.drivers);
    covered += pageSize;
  }
  if (covered < expected) {
    throw new Error(`Driver roster paging stopped after ${covered} of ${expected} records`);
  }
  const uniqueDrivers = [...new Map(drivers.map((driver) => [driver.id, driver])).values()];
  return { drivers: uniqueDrivers, total: expected };
}

export type MaintenanceDriverRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  status: string;
  notes: string | null;
  source: "Samsara" | "Manual" | "Voided" | string;
  voided_at: string | null;
  voided_reason: string | null;
};

export function listMaintenanceDrivers(
  operatingCompanyId: string,
  params: { search?: string; include_voided?: boolean } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.search) q.set("search", params.search);
  if (params.include_voided != null) q.set("include_voided", String(params.include_voided));
  return apiRequest<{ rows: MaintenanceDriverRow[]; csv_import_enabled: boolean }>(
    `/api/v1/maintenance/drivers?${q.toString()}`
  );
}
