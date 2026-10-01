/**
 * C-20 / D11–D20 / A-13 — Driver Profile tab model.
 * Accounting tabs (Settlements / Cash Advances / Deductions) stay on the payee profile.
 * Permits stay operational (Safety / Driver Hub) — not a top-level payee tab.
 * Disputes are operational workflow — reachable as a cross-link from Settlements, not their own GL tab.
 */

export const DRIVER_PROFILE_TABS = [
  "Overview",
  "Settlements",
  "Cash Advances",
  "Deductions",
  "Loads",
  "Fuel",
  "Maintenance",
  "Safety",
  "Documents",
  "Legal",
  "Communications",
  "Reports",
  "Activity",
] as const;

export type DriverProfileTab = (typeof DRIVER_PROFILE_TABS)[number];

export const DRIVER_PROFILE_TAB_QUERY: Record<DriverProfileTab, string> = {
  Overview: "overview",
  Settlements: "settlements",
  "Cash Advances": "cash_advances",
  Deductions: "deductions",
  Loads: "loads",
  Fuel: "fuel",
  Maintenance: "maintenance",
  Safety: "safety",
  Documents: "documents",
  Legal: "legal",
  Communications: "communications",
  Reports: "reports",
  Activity: "activity",
};

const FROM_QUERY: Record<string, DriverProfileTab> = Object.fromEntries(
  Object.entries(DRIVER_PROFILE_TAB_QUERY).map(([label, slug]) => [slug, label as DriverProfileTab]),
) as Record<string, DriverProfileTab>;

export function parseDriverProfileTab(raw: string | null): DriverProfileTab {
  if (!raw) return "Overview";
  const key = raw.trim().toLowerCase();
  if (key === "earnings" || key === "pre_settlements" || key === "presettlements") return "Settlements";
  return FROM_QUERY[key] ?? "Overview";
}

/** A-14 — QBO Vendor-style report shells inside the Driver Profile. */
export const DRIVER_PROFILE_REPORTS = ["Statement", "Activity", "Transactions", "Deductions"] as const;
export type DriverProfileReport = (typeof DRIVER_PROFILE_REPORTS)[number];
