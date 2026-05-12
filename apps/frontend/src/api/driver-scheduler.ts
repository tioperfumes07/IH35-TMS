import { apiRequest } from "./client";

export type FleetScheduleResponse = {
  start_date: string;
  end_date: string;
  drivers: Array<Record<string, unknown>>;
  leave_day_cells: Array<Record<string, unknown>>;
  pending_requests: Array<Record<string, unknown>>;
  vacant_units: Array<Record<string, unknown>>;
};

function withCompanyQuery(path: string, operatingCompanyId: string, params: Record<string, string>) {
  const search = new URLSearchParams({ operating_company_id: operatingCompanyId, ...params });
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${search.toString()}`;
}

export const driverSchedulerOfficeApi = {
  getGrid(operatingCompanyId: string, startDate: string, endDate: string) {
    return apiRequest<FleetScheduleResponse>(
      withCompanyQuery("/api/v1/safety/scheduler/grid", operatingCompanyId, {
        start_date: startDate,
        end_date: endDate,
      })
    );
  },

  listPending(operatingCompanyId: string) {
    return apiRequest<{ requests: Record<string, unknown>[] }>(
      withCompanyQuery("/api/v1/safety/scheduler/requests/pending", operatingCompanyId, {})
    );
  },

  getRequestDetail(operatingCompanyId: string, id: string) {
    return apiRequest<{
      request: Record<string, unknown>;
      audit_log: Record<string, unknown>[];
      leave_days: Record<string, unknown>[];
    }>(withCompanyQuery(`/api/v1/safety/scheduler/requests/${encodeURIComponent(id)}`, operatingCompanyId, {}));
  },

  reviewRequest(
    operatingCompanyId: string,
    id: string,
    body: {
      action: "approve" | "approve_modified" | "deny" | "defer";
      approved_start_date?: string;
      approved_end_date?: string;
      modification_reason?: string;
      denied_reason?: string;
    }
  ) {
    return apiRequest<Record<string, unknown>>(
      withCompanyQuery(`/api/v1/safety/scheduler/requests/${encodeURIComponent(id)}/review`, operatingCompanyId, {}),
      { method: "POST", body }
    );
  },

  getPolicy(operatingCompanyId: string) {
    return apiRequest<Record<string, unknown>>(`/api/v1/safety/scheduler/policy/${encodeURIComponent(operatingCompanyId)}`);
  },
};
