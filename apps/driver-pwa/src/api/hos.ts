// TODO: extract to packages/shared-types in P3-T11.15.4 cleanup.
// Copied from office/dispatch HOS badge shape.
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

// TODO: wire to /api/driver/hos in P3-T11.15.4
export async function getMyHosClocks(): Promise<HosSnapshot> {
  const now = Date.now();
  return {
    duty_status: "driving",
    clocks: [
      { key: "drive", remaining_minutes: 190, max_minutes: 660, next_reset_at: new Date(now + 8 * 3600_000).toISOString() },
      { key: "shift", remaining_minutes: 330, max_minutes: 840, next_reset_at: new Date(now + 11 * 3600_000).toISOString() },
      { key: "cycle", remaining_minutes: 880, max_minutes: 4200, next_reset_at: new Date(now + 35 * 3600_000).toISOString() },
      { key: "break", remaining_minutes: 18, max_minutes: 30, next_reset_at: new Date(now + 20 * 60_000).toISOString() },
    ],
    last_synced_at: new Date(now - 8 * 60_000).toISOString(),
    status: {
      id: "driver-self",
      hos_badge_color: "amber",
      is_in_violation: false,
      minutes_until_violation: 18,
    },
  };
}
