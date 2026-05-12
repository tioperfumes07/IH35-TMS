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

export function listMyLeaveRequests() {
  return apiRequest<{ requests: DriverLeaveRequestRow[] }>("/api/v1/driver/scheduler/my-requests");
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
