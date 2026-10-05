/**
 * DRV-F415 / DRV-F416 — approved driver profile tabs (DriverDetail.dc.html).
 * Survivor page: pages/drivers/DriverProfilePage.tsx at /drivers/:id.
 * Tab is URL-synced via ?tab= — same shape as parseDriverSubnav / parseDriverListStatus.
 */

export const DRIVER_PROFILE_TABS = [
  "Overview",
  "Settlements",
  "Additional payments",
  "Cash advances",
  "Loads",
  "Fuel",
  "Complaints",
  "Documents",
  "Driver disputes",
] as const;

export type DriverProfileTab = (typeof DRIVER_PROFILE_TABS)[number];

export const DRIVER_PROFILE_TAB_QUERY: Record<DriverProfileTab, string> = {
  Overview: "overview",
  Settlements: "settlements",
  "Additional payments": "additional_payments",
  "Cash advances": "cash_advances",
  Loads: "loads",
  Fuel: "fuel",
  Complaints: "complaints",
  Documents: "documents",
  "Driver disputes": "driver_disputes",
};

const FROM_QUERY: Record<string, DriverProfileTab> = Object.fromEntries(
  Object.entries(DRIVER_PROFILE_TAB_QUERY).map(([label, slug]) => [slug, label as DriverProfileTab]),
) as Record<string, DriverProfileTab>;

/** Retired slugs stay readable (Rule 07) and land on the approved tab they belong to. */
const ALIASES: Record<string, DriverProfileTab> = {
  earnings: "Settlements",
  pre_settlements: "Settlements",
  presettlements: "Settlements",
  deductions: "Additional payments",
  additional: "Additional payments",
  additional_pay: "Additional payments",
  cash_advance: "Cash advances",
  disputes: "Driver disputes",
  driver_dispute: "Driver disputes",
  complaint: "Complaints",
  // Removed competing-profile tabs — not named in the approved 9.
  maintenance: "Overview",
  safety: "Overview",
  legal: "Overview",
  communications: "Overview",
  reports: "Overview",
  activity: "Overview",
  profile: "Overview",
  operations: "Overview",
};

/**
 * Parse the driver-profile tab from `?tab=`. Accepts URLSearchParams (module standard)
 * or a raw string so existing callers / tests keep working.
 */
export function parseDriverProfileTab(raw: string | null | URLSearchParams): DriverProfileTab {
  const value = raw instanceof URLSearchParams ? raw.get("tab") : raw;
  if (!value) return "Overview";
  const key = value.trim().toLowerCase();
  if (key in ALIASES) return ALIASES[key];
  return FROM_QUERY[key] ?? "Overview";
}

/** A-14 — QBO Vendor-style report shells (kept; not a top-level profile tab). */
export const DRIVER_PROFILE_REPORTS = ["Statement", "Activity", "Transactions", "Deductions"] as const;
export type DriverProfileReport = (typeof DRIVER_PROFILE_REPORTS)[number];
