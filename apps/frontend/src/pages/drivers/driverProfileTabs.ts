/**
 * DRV-F420 / DRV-F416 / DRV-F421 — approved driver profile tabs
 * (10-05-2026-SPEC-DRIVER-PROFILE-FLEET.md + DriverDetail.dc.html).
 *
 * 12 named on the strip. 5 behind More. Edit is ?tab=edit on the same shell.
 * Parsed by one exported function shaped like parseDriverSubnav.
 */

export const DRIVER_PROFILE_STRIP_TABS = [
  "Overview",
  "Settlements",
  "Additional payments",
  "Cash advances",
  "Pay & escrow",
  "Loads",
  "Fuel",
  "Reports & damage",
  "Complaints",
  "Safety & accidents",
  "Documents",
  "Driver disputes",
] as const;

export const DRIVER_PROFILE_MORE_TABS = [
  "Safety file",
  "ELD edits",
  "Legal matters",
  "QBO mapping",
  "Audit history",
] as const;

export const DRIVER_PROFILE_TABS = [
  ...DRIVER_PROFILE_STRIP_TABS,
  ...DRIVER_PROFILE_MORE_TABS,
] as const;

export type DriverProfileStripTab = (typeof DRIVER_PROFILE_STRIP_TABS)[number];
export type DriverProfileMoreTab = (typeof DRIVER_PROFILE_MORE_TABS)[number];
export type DriverProfileNamedTab = (typeof DRIVER_PROFILE_TABS)[number];
export type DriverProfileTab = DriverProfileNamedTab | "Edit";

export const DRIVER_PROFILE_TAB_QUERY: Record<DriverProfileTab, string> = {
  Overview: "overview",
  Settlements: "settlements",
  "Additional payments": "additional_payments",
  "Cash advances": "cash_advances",
  "Pay & escrow": "pay_escrow",
  Loads: "loads",
  Fuel: "fuel",
  "Reports & damage": "reports_damage",
  Complaints: "complaints",
  "Safety & accidents": "safety_accidents",
  Documents: "documents",
  "Driver disputes": "driver_disputes",
  "Safety file": "safety_file",
  "ELD edits": "eld_edits",
  "Legal matters": "legal_matters",
  "QBO mapping": "qbo_mapping",
  "Audit history": "audit_history",
  Edit: "edit",
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
  addpay: "Additional payments",
  cash_advance: "Cash advances",
  advances: "Cash advances",
  payesc: "Pay & escrow",
  escrow: "Pay & escrow",
  operations: "Pay & escrow",
  damage: "Reports & damage",
  reports: "Reports & damage",
  safety: "Safety & accidents",
  accidents: "Safety & accidents",
  docs: "Documents",
  disputes: "Driver disputes",
  driver_dispute: "Driver disputes",
  complaint: "Complaints",
  sfile: "Safety file",
  "safety file": "Safety file",
  eld: "ELD edits",
  legal: "Legal matters",
  qbo: "QBO mapping",
  audit: "Audit history",
  profile: "Edit",
  maintenance: "Reports & damage",
  communications: "Overview",
  activity: "Audit history",
};

/**
 * Parse the driver-profile tab from `?tab=`. Accepts URLSearchParams (module standard)
 * or a raw string so existing callers / tests keep working.
 */
export function parseDriverProfileTab(raw: string | null | URLSearchParams): DriverProfileTab {
  const value = raw instanceof URLSearchParams ? raw.get("tab") : raw;
  if (!value) return "Overview";
  const key = value.trim().toLowerCase().replace(/-/g, "_");
  if (key in ALIASES) return ALIASES[key];
  return FROM_QUERY[key] ?? "Overview";
}

export function driverProfileTabHref(driverId: string, tab: DriverProfileTab): string {
  const slug = DRIVER_PROFILE_TAB_QUERY[tab];
  if (tab === "Overview") return `/drivers/${driverId}`;
  return `/drivers/${driverId}?tab=${slug}`;
}

/** A-14 — QBO Vendor-style report shells (kept; not a top-level profile tab). */
export const DRIVER_PROFILE_REPORTS = ["Statement", "Activity", "Transactions", "Deductions"] as const;
export type DriverProfileReport = (typeof DRIVER_PROFILE_REPORTS)[number];
