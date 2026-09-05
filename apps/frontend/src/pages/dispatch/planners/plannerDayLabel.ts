// GLB-08 (owner 2026-09-03): "Dates render MMM-DD (AUG-21, SEPT-01), never 08-21." Uppercase
// 3-letter month, hyphen, zero-padded day — one fixed-width shape for every column header, not
// the locale-dependent "Aug 16" Intl.toLocaleDateString produced before.
// GLB-08 correction (owner confirmed 2026-09-04): September is "SEPT", 4 letters — the owner's own
// original example ("AUG-21, SEPT-01" above) already said so; every other month stays 3-letter.
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"];

/**
 * Planner / Round Trips day headers: "AUG-16", never "08-16" (YYYY-MM-DD.slice(5)) and never the
 * locale-formatted "Aug 16" this used to produce. Calendar-date only, no time-of-day component.
 */
export function formatPlannerDayLabel(isoYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd.trim());
  if (!m) return isoYmd;
  const mo = Number(m[2]);
  const d = m[3];
  const abbr = MONTH_ABBR[mo - 1];
  if (!abbr) return isoYmd;
  return `${abbr}-${d}`;
}
