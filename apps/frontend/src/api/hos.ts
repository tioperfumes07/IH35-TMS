import { apiRequest } from "./client";

export type DriverHosDetail = {
  driver_id: string;
  clocks: {
    drive_remaining_min: number;
    window_remaining_min: number;
    break_remaining_min: number;
    cycle_remaining_min: number;
    last_reset_at: string | null;
    status: "ok" | "warning_1hr" | "warning_15min" | "violation";
  };
  timeline_24h: Array<{
    id: string;
    duty_status: string;
    started_at: string;
    ended_at: string | null;
    unit_id: string | null;
    source: string;
    odometer_mi: number | null;
    location: string | null;
  }>;
  summary_8d: Array<{
    service_day: string;
    duty_status: string;
    total_minutes: number;
  }>;
  manual_edits: {
    count: number;
    requires_supervisor_signoff: boolean;
    events: Array<{
      id: string;
      started_at: string;
      duty_status: string;
    }>;
  };
};

export function getDriverHosDetail(driverId: string, operatingCompanyId: string) {
  return apiRequest<DriverHosDetail>(
    `/api/v1/telematics/drivers/${encodeURIComponent(driverId)}/hos?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}
