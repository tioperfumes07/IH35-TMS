/**
 * Ch.11 petition / case filing date for Form 425C.
 * Never invent a literal (e.g. "2025-02-03") — court filing risk.
 * Sources: Profiles & Defaults user entry, or earliest prior report petition_date (case SoR).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE.test(value.trim());
}

/** Resolve petition date for report create — profile / UI only; never a hardcoded default. */
export function resolveCreatePetitionDate(profilePetitionDate: string | null | undefined): string {
  const petitionDate = profilePetitionDate?.trim() ?? "";
  if (!isIsoDate(petitionDate)) {
    throw new Error(
      "Set Petition Date (YYYY-MM-DD) in Profiles & Defaults before creating a report — never hardcode"
    );
  }
  return petitionDate;
}

type ReportPetitionRow = {
  petition_date?: unknown;
  created_at?: unknown;
  reporting_month?: unknown;
};

/** Earliest case petition_date from existing reports (SoR). Empty if none recorded. */
export function casePetitionDateFromReports(reports: ReportPetitionRow[]): string | null {
  const sorted = [...reports]
    .filter((r) => isIsoDate(String(r.petition_date ?? "").slice(0, 10)))
    .sort((a, b) =>
      String(a.created_at ?? a.reporting_month).localeCompare(String(b.created_at ?? b.reporting_month))
    );
  const caseDate = String(sorted[0]?.petition_date ?? "").slice(0, 10);
  return isIsoDate(caseDate) ? caseDate : null;
}
