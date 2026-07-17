import type { MyCompany } from "../api/org";

/** Compact label for the office company switcher (short name preferred). */
export function selectedCompanySwitcherLabel(company: MyCompany | null | undefined, fallback = "Select company"): string {
  return company?.short_name?.trim() || company?.legal_name?.trim() || fallback;
}

/** Legal-entity badge label for the topbar chip (legal name preferred). */
export function selectedCompanyLegalBadgeLabel(company: MyCompany | null | undefined): string {
  return company?.legal_name?.trim() || selectedCompanySwitcherLabel(company, "");
}
