// DISPATCH-UI-REFINE-2 ITEM 5 — Samsara-standard HOS clock set, computed from the in-app HOS store
// (same service as #1109 — getDriverHosStatus; NO Samsara call from the board). Column keys + the
// Samsara /fleet/hos/clocks field each maps to are LOCKED here so the CI guard can assert the binding.
//
// Names + sources locked by Jorge (Samsara/FMCSA research):
//   Drive     → clocks.drive.driveRemainingDurationMs        (driving time left of 11h)
//   Shift     → clocks.shift.shiftRemainingDurationMs        (on-duty window left of 14h)
//   Break     → clocks.break.timeUntilBreakDurationMs        (time until required 30-min break, of 8h)
//   Cycle     → clocks.cycle.cycleRemainingDurationMs        (hours left in 70h/7-8-day cycle)
//   Stop By   → DERIVED (projected clock time the driver must stop)
//   Resume At → DERIVED (projected clock time the driver can drive again)

export type HosStatusRow = {
  driver_id: string;
  drive_remaining_min: number;
  window_remaining_min: number;
  break_remaining_min: number;
  cycle_remaining_min: number;
  last_reset_at: string | null;
  status: "ok" | "warning_1hr" | "warning_15min" | "violation";
};

export type HosColumnKey = "drive" | "shift" | "break" | "cycle" | "stopBy" | "resumeAt";

// The 6 ordered HOS columns. `samsaraField` documents the Samsara field this maps to; `derived`
// marks the two projected clocks (Stop By / Resume At).
export const HOS_COLUMNS: ReadonlyArray<{
  key: HosColumnKey;
  label: string;
  samsaraField: string;
  derived?: boolean;
}> = [
  { key: "drive", label: "Drive", samsaraField: "clocks.drive.driveRemainingDurationMs" },
  { key: "shift", label: "Shift", samsaraField: "clocks.shift.shiftRemainingDurationMs" },
  { key: "break", label: "Break", samsaraField: "clocks.break.timeUntilBreakDurationMs" },
  { key: "cycle", label: "Cycle", samsaraField: "clocks.cycle.cycleRemainingDurationMs" },
  { key: "stopBy", label: "Stop By", samsaraField: "DERIVED", derived: true },
  { key: "resumeAt", label: "Resume At", samsaraField: "DERIVED", derived: true },
];

const RESET_MIN = 10 * 60; // FMCSA 10-hour off-duty reset (split-sleeper not modeled until ELD data lands).

export function fmtHMM(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const safe = Math.max(0, Math.floor(min));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function fmtLocalClock(date: Date | null): string {
  if (!date) return "—";
  // "h:mm a" in the dispatcher's local timezone.
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export type HosClocks = {
  drive: string;
  shift: string;
  break: string;
  cycle: string;
  stopBy: string;
  resumeAt: string;
  // raw minutes for testing/guards
  driveConstrainedMin: number;
  stopByMin: number;
};

// MOST-CONSTRAINING-LIMIT (mirrors the Samsara dial): the drivable time shown is the smallest of the
// raw Drive (11h), the Shift window (14h), and the Cycle (70h) remaining — never a naive 11h. Stop By =
// now + that constrained remaining (assumes continuous driving). Resume At = Stop By + the 10h reset.
// Both Stop By/Resume At are PROJECTED — they shift with duty status.
export function computeHosClocks(row: HosStatusRow | null | undefined, now: Date = new Date()): HosClocks | null {
  if (!row) return null;
  const drive = row.drive_remaining_min;
  const shift = row.window_remaining_min;
  const brk = row.break_remaining_min;
  const cycle = row.cycle_remaining_min;
  const driveConstrainedMin = Math.min(drive, shift, cycle);
  const stopByMin = Math.max(0, Math.min(driveConstrainedMin, shift));
  const stopBy = new Date(now.getTime() + stopByMin * 60_000);
  const resumeAt = new Date(stopBy.getTime() + RESET_MIN * 60_000);
  return {
    drive: fmtHMM(driveConstrainedMin),
    shift: fmtHMM(shift),
    break: fmtHMM(brk),
    cycle: fmtHMM(cycle),
    stopBy: fmtLocalClock(stopBy),
    resumeAt: fmtLocalClock(resumeAt),
    driveConstrainedMin,
    stopByMin,
  };
}

// Tooltip text reused by the projected clocks so they are never presented as guaranteed.
export const HOS_PROJECTED_TOOLTIP = "Projected — assumes continuous driving from now; shifts with duty status.";

// Small duty-status indicator. The in-app HOS store currently exposes HOS health (ok/warning/violation),
// not the 4-state duty type (driving/on-duty/off-duty/sleeper) — that arrives with the Samsara duty-event
// ingest. Map the real health signal to a dot color; never fabricate a duty type we don't have.
export function hosStatusDot(status: HosStatusRow["status"] | null | undefined): { cls: string; label: string } {
  if (status === "violation") return { cls: "bg-red-500", label: "HOS violation" };
  if (status === "warning_15min" || status === "warning_1hr") return { cls: "bg-amber-500", label: "HOS warning" };
  if (status === "ok") return { cls: "bg-emerald-500", label: "HOS ok" };
  return { cls: "bg-gray-300", label: "No HOS data" };
}
