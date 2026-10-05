/** Canonical Drivers module subnav. DRV-F418 — /drivers is Home; roster is its own tab. */
export const DRIVERS_SUBNAV = [
  { id: "home", label: "Home" },
  { id: "roster", label: "Roster" },
  { id: "profiles", label: "Profiles" },
  { id: "settlements", label: "Settlements ▾" },
  { id: "pre_settlements", label: "Pre-settlements" },
  { id: "cash_advances", label: "Cash advances" },
  { id: "cash_advance_requests", label: "Cash advance requests" },
  { id: "pay_rate_templates", label: "Pay rate templates" },
  { id: "leave", label: "Leave" },
  { id: "team_splits", label: "Team Splits" },
] as const;

export type DriversSubnavId = (typeof DRIVERS_SUBNAV)[number]["id"];

/** List status filters on the Roster subtab (`?status=`). */
export const DRIVERS_LIST_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "probation", label: "Probation" },
  { id: "inactive", label: "Inactive" },
  { id: "on_leave", label: "On Leave" },
  { id: "terminated", label: "Terminated" },
] as const;

export type DriversListStatusId = (typeof DRIVERS_LIST_STATUS_TABS)[number]["id"];

/**
 * Module nav paths for nav-integrity guard.
 * C-33 — Permits removed (unit-keyed at safety.permits). Deductions fold under Settlements.
 * Disputes live at the three-way hub (C-25), not a peer Drivers tab.
 * Cash advance requests joins the module tab bar (was a full-width single-item band).
 */
export const DRIVERS_MODULE_NAV_PATHS = ["/drivers", "/driver-finance/cash-advance-requests"] as const;

/** KPI strip on `/drivers` home (data-backed). */
export const DRIVERS_KPI_STRIP = [
  { id: "active", label: "Active" },
  { id: "on_loads", label: "On Loads" },
  { id: "available", label: "Available" },
  { id: "on_leave", label: "On Leave" },
  { id: "settle_due", label: "Settle Due" },
  { id: "drivers_owe", label: "Drivers Owe" },
  { id: "escrow", label: "Escrow" },
] as const;

/** Canonical inventory for count/nav integrity guards. Home + Roster + 8 peers = 10. */
export const DRIVERS_CANONICAL_SUBNAV_COUNT = 10;
export const DRIVERS_CANONICAL_LIST_STATUS_TAB_COUNT = 6;
export const DRIVERS_CANONICAL_KPI_COUNT = 7;
export const DRIVERS_CANONICAL_MODULE_NAV_COUNT = 2;

export const DRIVERS_SUBNAV_IDS = DRIVERS_SUBNAV.map((tab) => tab.id);

export function parseDriverSubnav(searchParams: URLSearchParams): DriversSubnavId {
  const raw = (searchParams.get("subtab") ?? "home").toLowerCase();
  // C-33 redirects — retired peer tabs map onto their new homes.
  if (raw === "permits") return "home";
  if (raw === "deductions") return "settlements";
  if (raw === "disputes") return "home";
  // Legacy first-tab id was "drivers" (the roster). Roster is now its own tab.
  if (raw === "drivers") return "roster";
  return (DRIVERS_SUBNAV_IDS as readonly string[]).includes(raw) ? (raw as DriversSubnavId) : "home";
}

export function parseDriverListStatus(searchParams: URLSearchParams): DriversListStatusId {
  // Default to Active-only so hidden (Inactive) drivers don't clutter the roster; the Active/Inactive/All
  // toggle still flips to the others. No `status` param in the URL = Active (the clean default).
  const raw = (searchParams.get("status") ?? "active").toLowerCase();
  return (DRIVERS_LIST_STATUS_TABS as readonly { id: string }[]).some((tab) => tab.id === raw)
    ? (raw as DriversListStatusId)
    : "active";
}

/** Roster view toggle (`?view=` on `/drivers/roster`). Default = roster list. */
export const DRIVERS_HOME_VIEW_IDS = ["roster", "teams"] as const;
export type DriversHomeViewId = (typeof DRIVERS_HOME_VIEW_IDS)[number];

export function parseDriversHomeView(searchParams: URLSearchParams): DriversHomeViewId {
  const raw = (searchParams.get("view") ?? "roster").toLowerCase();
  if (raw === "drivers") return "roster";
  return (DRIVERS_HOME_VIEW_IDS as readonly string[]).includes(raw) ? (raw as DriversHomeViewId) : "roster";
}
