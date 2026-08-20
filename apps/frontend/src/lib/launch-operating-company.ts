/**
 * USMCA-only until launch (owner 2026-08-19 / 2026-08-20).
 * IH 35 Transportation (TRANSP) stopped operating 2026-08-10.
 * USMCA began operating 2026-08-07.
 * Trucking (TRK) is the lessor — not the launch operating company.
 * Hide TRANSP + TRK from the office switcher. QBO chrome keys off TRANSP, so hiding TRANSP
 * turns QuickBooks surfaces off without deleting companies or history.
 */
export const LAUNCH_OPERATING_COMPANY_CODES = ["USMCA"] as const;

export function isLaunchOperatingCompanyCode(code: string | null | undefined): boolean {
  return String(code ?? "").trim().toUpperCase() === "USMCA";
}

export function filterLaunchOperatingCompanies<T extends { code: string; is_active?: boolean }>(
  companies: T[],
): T[] {
  return companies.filter((c) => c.is_active !== false && isLaunchOperatingCompanyCode(c.code));
}
