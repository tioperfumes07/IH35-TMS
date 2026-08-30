import { apiRequest } from "./client";

export type FleetScheduleResponse = {
  start_date: string;
  end_date: string;
  drivers: Array<Record<string, unknown>>;
  leave_day_cells: Array<Record<string, unknown>>;
  pending_requests: Array<Record<string, unknown>>;
  vacant_units: Array<Record<string, unknown>>;
};

// SAFETY-TEMP-COVER-ASSIGNMENTS-ZERO-FE-CALLERS — /api/v1/safety/scheduler/temp-assignments
// (list/create/cancel) has existed on the backend since GAP-81's scheduler build but had ZERO
// frontend callers anywhere; this is the client for it.
export type TempAssignment = {
  id: string;
  operating_company_id: string;
  unit_id: string;
  unit_number: string | null;
  primary_driver_id: string;
  primary_driver_name: string | null;
  cover_driver_id: string;
  cover_driver_name: string | null;
  start_date: string;
  end_date: string;
  related_leave_request_id: string | null;
  notes: string | null;
  created_at: string;
  created_by_user_id: string;
  voided_at: string | null;
  voided_by_user_id: string | null;
  void_reason: string | null;
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

  listPending(operatingCompanyId: string, limit = 50, offset = 0) {
    return apiRequest<{ requests: Record<string, unknown>[]; total_count: number; limit: number; offset: number }>(
      withCompanyQuery("/api/v1/safety/scheduler/requests/pending", operatingCompanyId, {
        limit: String(limit),
        offset: String(offset),
      })
    );
  },

  listDriverRequests(operatingCompanyId: string, driverId: string, limit = 25, offset = 0) {
    return apiRequest<{ requests: Record<string, unknown>[]; total_count: number; limit: number; offset: number }>(
      withCompanyQuery("/api/v1/safety/scheduler/requests", operatingCompanyId, {
        driver_id: driverId,
        limit: String(limit),
        offset: String(offset),
      }),
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

  listBalances(operatingCompanyId: string, year?: number) {
    const params: Record<string, string> = {};
    if (year != null) params.year = String(year);
    return apiRequest<{
      policy: Record<string, unknown> | null;
      year: number;
      balances: Array<Record<string, unknown>>;
    }>(withCompanyQuery("/api/v1/safety/scheduler/balances", operatingCompanyId, params));
  },

  listTempAssignments(
    operatingCompanyId: string,
    filters: { driver_id?: string; unit_id?: string; limit?: number; offset?: number } = {},
  ) {
    return apiRequest<{ assignments: TempAssignment[]; total_count: number; limit: number; offset: number }>(
      withCompanyQuery("/api/v1/safety/scheduler/temp-assignments", operatingCompanyId, {
        ...(filters.driver_id ? { driver_id: filters.driver_id } : {}),
        ...(filters.unit_id ? { unit_id: filters.unit_id } : {}),
        limit: String(filters.limit ?? 50),
        offset: String(filters.offset ?? 0),
      })
    );
  },

  assignTempCover(
    operatingCompanyId: string,
    body: {
      unit_id: string;
      primary_driver_id: string;
      cover_driver_id: string;
      start_date: string;
      end_date: string;
      related_leave_request_id?: string;
      notes?: string;
    }
  ) {
    return apiRequest<TempAssignment>(
      withCompanyQuery("/api/v1/safety/scheduler/temp-assignments", operatingCompanyId, {}),
      { method: "POST", body }
    );
  },

  cancelTempCover(operatingCompanyId: string, id: string, reason?: string) {
    return apiRequest<TempAssignment>(
      withCompanyQuery(`/api/v1/safety/scheduler/temp-assignments/${encodeURIComponent(id)}/cancel`, operatingCompanyId, {}),
      { method: "POST", body: { reason } }
    );
  },
};
