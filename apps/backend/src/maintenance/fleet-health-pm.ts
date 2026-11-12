import { companyBusinessDate } from "../lib/company-business-date.js";
import type { PmDueEngineRow } from "./pm-due-engine.service.js";
import type { PmOdometer } from "./pm-current-odometer.js";

/** Adapt the canonical PM engine once for both the fleet KPI and paginated rows. */
export function fleetHealthPmRows(rows: PmDueEngineRow[], today = companyBusinessDate(), odometers = new Map<string, PmOdometer>()) {
  const rank = { overdue: 0, soon: 1, unknown: 2, none: 3, ok: 4 };
  const mapped = rows.filter(row => row.interval_kind === "miles").map(row => {
    const days = row.projected_due_date == null ? null
      : Math.round((Date.parse(`${row.projected_due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const daysLeft = days != null && Number.isFinite(days) ? days : null;
    const baselineAbsent = row.baseline_absent;
    const state: keyof typeof rank = row.miles_to_due == null ? (baselineAbsent ? "none" : "unknown")
      : row.miles_to_due <= 0 ? "overdue"
      : daysLeft == null ? "unknown" : daysLeft <= 14 ? "soon" : "ok";
    return {
      unit_id: row.unit_id, pm_schedule_id: row.pm_schedule_id as string | null, pm_label: row.label as string | null,
      pm_interval: row.interval_miles, last_service_odometer: row.last_service_odometer,
      next_due_odometer: row.current_odometer != null && row.miles_to_due != null
        ? row.current_odometer + row.miles_to_due : null,
      odometer_mi: row.current_odometer, odometer_source: row.current_odometer_source,
      odometer_read_at: row.current_odometer_read_at,
      pm_baseline_absent: baselineAbsent,
      miles_left: row.miles_to_due, days_left: daysLeft, state,
      pm_status_reason: row.reason ?? row.current_odometer_note,
    };
  });
  mapped.sort((a, b) => a.unit_id.localeCompare(b.unit_id)
    || rank[a.state] - rank[b.state]
    || (a.miles_left ?? Infinity) - (b.miles_left ?? Infinity)
    || (a.pm_schedule_id ?? "").localeCompare(b.pm_schedule_id ?? ""));
  const selected = mapped.filter((row, index) => index === 0 || mapped[index - 1].unit_id !== row.unit_id);
  const scheduled = new Set(selected.map(row => row.unit_id));
  for (const [unitId, odo] of odometers) {
    if (scheduled.has(unitId)) continue;
    selected.push({ unit_id: unitId, pm_schedule_id: null, pm_label: null,
      pm_interval: null, last_service_odometer: null, next_due_odometer: null,
      odometer_mi: odo.odometer, odometer_source: odo.source, odometer_read_at: odo.read_at,
      pm_baseline_absent: false, miles_left: null, days_left: null, state: "none", pm_status_reason: "No active miles PM schedule" });
  }
  return selected;
}

/** Same parameter and row shape in BOTH SQL consumers; no independent telemetry fallback. */
export const FLEET_PM_CTE = `pm_best AS (
  SELECT * FROM jsonb_to_recordset($4::jsonb) AS pm(
    unit_id uuid, pm_schedule_id uuid, pm_label text, pm_interval numeric,
    last_service_odometer numeric, next_due_odometer numeric,
    odometer_mi numeric, odometer_source text, odometer_read_at text,
    pm_baseline_absent boolean, miles_left numeric, days_left numeric,
    state text, pm_status_reason text
  )
)`;
