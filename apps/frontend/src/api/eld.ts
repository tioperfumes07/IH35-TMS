/**
 * ELD module read clients — reuse existing telematics / safety endpoints.
 * No new backend routes; production never invents fixture rows.
 */
import { getHosDailyRoster, DUTY_LABEL, type HosRoster, type HosRosterDriver } from "./hosTracker";
import { listHosViolations } from "./safetyV64";
import { getFleetLocationHos, type FleetLocationHosRow } from "./reports";

export { DUTY_LABEL, getHosDailyRoster, listHosViolations, getFleetLocationHos };
export type { HosRoster, HosRosterDriver, FleetLocationHosRow };

export type EldHosViolation = Record<string, unknown>;

/** Live duty roster for the carrier calendar day (America/Chicago). */
export function fetchEldLiveDutyRoster(operatingCompanyId: string, date: string) {
  return getHosDailyRoster(operatingCompanyId, date);
}

/** Open HOS violations (voided rows filtered by callers). */
export function fetchEldHosViolations(operatingCompanyId: string, range: { limit?: number; offset?: number } = {}) {
  return listHosViolations(operatingCompanyId, range);
}

/**
 * Unidentified driving proxy from the existing fleet-location-hos feed:
 * InService units that are reporting motion/engine activity without a Samsara-assigned driver.
 * There is no dedicated unidentified-driving ingest API yet — this is honest, not fabricated.
 */
export function isUnidentifiedDrivingRow(row: FleetLocationHosRow): boolean {
  if (row.driver_id) return false;
  const speed = row.speed_mph == null ? null : Number(row.speed_mph);
  const moving = speed != null && Number.isFinite(speed) && speed > 0;
  const engine = (row.engine_state ?? "").toLowerCase();
  const engineActive = engine === "on" || engine === "idle";
  return moving || engineActive;
}

export function fetchEldUnidentifiedDriving(operatingCompanyId: string) {
  return getFleetLocationHos(operatingCompanyId).then((payload) => ({
    ...payload,
    rows: (payload.rows ?? []).filter(isUnidentifiedDrivingRow),
  }));
}
