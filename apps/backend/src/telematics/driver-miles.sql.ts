/**
 * CC-3 queue 2e (2026-10-02) — the ONE definition of "miles a driver drove" over a window, shared by the Driver Hub panel
 * and the DriverDetail overview (they used three: load miles with a planned-miles fallback, Samsara distance, stop-leg
 * sums). The stop-leg sum in driver-profile-tabs stays as what it is — a per-stop ledger — not a driver-miles figure.
 */
/**
 * Miles HE drove and fuel HIS truck burned: Samsara's per-driver daily fuel/energy report (E-23,
 * integrations.samsara_fuel_reports, subject_kind 'driver' — attributed by the driver's ELD login, not by a load
 * estimate). F / T are SQL timestamp expressions; reports are whole UTC days.
 */
export const driverSamsaraSql = (col: "distance_mi" | "fuel_burned_gal", D: string, F: string, T: string) =>
  `(SELECT coalesce(sum(fr.${col}), 0) FROM integrations.samsara_fuel_reports fr
     WHERE fr.subject_kind = 'driver' AND fr.driver_id = ${D} AND fr.report_date >= (${F})::date AND fr.report_date <= (${T})::date)`;
/** Unit-level distance / fuel over a window (vehicle reports) — for the trucks he has held. */
export const unitSamsaraSql = (col: "distance_mi" | "fuel_burned_gal", U: string, F: string, T: string) =>
  `(SELECT coalesce(sum(fr.${col}), 0) FROM integrations.samsara_fuel_reports fr
     WHERE fr.subject_kind = 'vehicle' AND fr.unit_id = ${U} AND fr.report_date >= (${F})::date AND fr.report_date <= (${T})::date)`;

