export type DriverHosStatus = {
  id: string;
  hos_badge_color: string | null;
  is_in_violation: boolean;
  minutes_until_violation: number;
};

export type DutyStatus = "driving" | "on_duty_not_driving" | "off_duty" | "sleeper_berth";

export type HosClock = {
  key: "drive" | "shift" | "cycle" | "break";
  remaining_minutes: number;
  max_minutes: number;
  next_reset_at: string | null;
};

export type HosSnapshot = {
  duty_status: DutyStatus;
  clocks: HosClock[];
  last_synced_at: string;
  status: DriverHosStatus;
};
