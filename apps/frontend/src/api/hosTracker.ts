import { apiRequest } from "./client";

// Compliance HOS Tracker (Blocks 02-05). The roster is the CANONICAL source — the timeline (Block 03) and the
// dense table (Block 04) both read it so they agree per driver. Honest by construction: available:false => clocks
// null + empty timeline (no fabricated/stale/over-counted numbers).
export type HosDutyStatus =
  | "off_duty" | "sleeper" | "driving" | "on_duty_not_driving" | "personal_conveyance" | "yard_moves";

export type HosClocks = {
  drive_remaining_min: number;
  window_remaining_min: number;
  break_remaining_min: number;
  cycle_remaining_min: number;
  cycle_reset_in_min: number | null;
  last_reset_at: string | null;
  status: "ok" | "warning_1hr" | "warning_15min" | "violation";
};

export type HosSegment = {
  duty_status: HosDutyStatus;
  start_utc: string;
  end_utc: string;
  start_ct: string;
  end_ct: string;
  minutes: number;
  day_offset: number; // [0,1] fraction of the 24h day
  day_width: number; // [0,1]
};

export type HosDaily = {
  driver_id: string;
  date: string;
  available: boolean;
  segments: HosSegment[];
  per_status_minutes: Record<HosDutyStatus, number>;
  clocks: HosClocks | null;
  driven_cycle_min: number | null; // 70h - cycle_remaining
  eight_day_breakdown: { date: string; on_duty_min: number }[];
};

export type HosRosterDriver = HosDaily & {
  driver_name: string | null;
  unit_number: string | null;
  current_duty_status: HosDutyStatus | null;
};

export type HosRoster = {
  date: string;
  generated_at: string;
  drivers: HosRosterDriver[];
  counts: { active: number; on_duty: number; driving: number; low: number; violation: number; unavailable: number };
};

export function getHosDailyRoster(operatingCompanyId: string, date: string) {
  return apiRequest<HosRoster>(
    `/api/v1/telematics/hos/daily-roster?operating_company_id=${encodeURIComponent(operatingCompanyId)}&date=${encodeURIComponent(date)}`
  );
}

export function getHosDaily(operatingCompanyId: string, driverId: string, date: string) {
  return apiRequest<HosDaily & { generated_at: string }>(
    `/api/v1/telematics/hos/daily?operating_company_id=${encodeURIComponent(operatingCompanyId)}&driver_id=${encodeURIComponent(driverId)}&date=${encodeURIComponent(date)}`
  );
}

// Duty-status display + the locked in-content band colors (Block 03 timeline + status dots).
export const DUTY_LABEL: Record<HosDutyStatus, string> = {
  driving: "Driving",
  on_duty_not_driving: "On Duty",
  off_duty: "Off Duty",
  sleeper: "Sleeper Berth",
  personal_conveyance: "Personal Conveyance",
  yard_moves: "Yard Move",
};
export const DUTY_COLOR: Record<HosDutyStatus, string> = {
  driving: "#2563B8",
  on_duty_not_driving: "#C9820B",
  sleeper: "#6B4F9E",
  off_duty: "#B7C0CC",
  personal_conveyance: "#1E9E62",
  yard_moves: "#B8902A",
};
