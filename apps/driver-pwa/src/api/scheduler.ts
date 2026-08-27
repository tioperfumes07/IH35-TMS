import { apiRequest } from "./client";

export type DriverLeaveRequestRow = Record<string, unknown>;

export type MyScheduleResponse = {
  approved_days: Array<{ d: string; leave_type: string; request_status: string; request_number: string }>;
  pending_requests: Array<{
    id: string;
    request_number: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    status: string;
  }>;
};

function rangeQuery(startDate: string, endDate: string) {
  return new URLSearchParams({ start_date: startDate, end_date: endDate }).toString();
}

export function getMySchedule(startDate: string, endDate: string) {
  return apiRequest<MyScheduleResponse>(`/api/v1/driver/scheduler/my-schedule?${rangeQuery(startDate, endDate)}`);
}

export function listMyLeaveRequests(limit: number, offset: number) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiRequest<{ requests: DriverLeaveRequestRow[]; total_count: number }>(
    `/api/v1/driver/scheduler/my-requests?${query.toString()}`,
  );
}

export type MyLeaveBalance = {
  plan_year: number;
  vacation_allocated: number;
  vacation_used: number;
  sick_allocated: number;
  sick_used: number;
  personal_allocated: number;
  personal_used: number;
} | null;

export type MyLeaveBalanceResponse = {
  balance: MyLeaveBalance;
  year: number;
};

export function getMyLeaveBalance() {
  return apiRequest<MyLeaveBalanceResponse>("/api/v1/driver/scheduler/balance");
}

export function createLeaveRequest(body: {
  leave_type: "vacation" | "sick" | "personal" | "wfh";
  start_date: string;
  end_date: string;
  reason: string;
  documentation_attachment_id?: string;
  suggested_cover_driver_id?: string;
}) {
  return apiRequest<DriverLeaveRequestRow>("/api/v1/driver/scheduler/request", { method: "POST", body });
}

export function cancelLeaveRequest(id: string) {
  return apiRequest<DriverLeaveRequestRow>(`/api/v1/driver/scheduler/request/${encodeURIComponent(id)}/cancel`, {
    method: "PATCH",
  });
}

export function attachLeaveDocumentation(requestId: string, documentation_attachment_id: string) {
  return apiRequest<DriverLeaveRequestRow>(`/api/v1/driver/scheduler/request/${encodeURIComponent(requestId)}/documentation`, {
    method: "POST",
    body: { documentation_attachment_id },
  });
}
