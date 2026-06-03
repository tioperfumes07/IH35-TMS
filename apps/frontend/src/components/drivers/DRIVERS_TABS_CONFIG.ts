/** Canonical Drivers module subnav (query-synced on `/drivers?subtab=`). Block A24-2. */
export const DRIVERS_SUBNAV = [
  { id: "drivers", label: "Drivers" },
  { id: "profiles", label: "Profiles" },
  { id: "settlements", label: "Settlements ▾" },
  { id: "pre_settlements", label: "Pre-settlements" },
  { id: "cash_advances", label: "Cash advances" },
  { id: "permits", label: "Permits" },
  { id: "pay_rate_templates", label: "Pay rate templates" },
  { id: "deductions", label: "Deductions" },
  { id: "leave", label: "Leave" },
] as const;

export type DriversSubnavId = (typeof DRIVERS_SUBNAV)[number]["id"];

/** List status filters on the primary Drivers subtab (`?status=`). */
export const DRIVERS_LIST_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "on_leave", label: "On Leave" },
  { id: "terminated", label: "Terminated" },
] as const;

export type DriversListStatusId = (typeof DRIVERS_LIST_STATUS_TABS)[number]["id"];

/** Module nav paths for nav-integrity guard (query subtabs stay on /drivers). */
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

/** Canonical inventory for count/nav integrity guards (Block A24-2). */
export const DRIVERS_CANONICAL_SUBNAV_COUNT = 9;
export const DRIVERS_CANONICAL_LIST_STATUS_TAB_COUNT = 5;
export const DRIVERS_CANONICAL_KPI_COUNT = 7;
export const DRIVERS_CANONICAL_MODULE_NAV_COUNT = 2;

export const DRIVERS_SUBNAV_IDS = DRIVERS_SUBNAV.map((tab) => tab.id);

export function parseDriverSubnav(searchParams: URLSearchParams): DriversSubnavId {
  const raw = (searchParams.get("subtab") ?? "drivers").toLowerCase();
  return (DRIVERS_SUBNAV_IDS as readonly string[]).includes(raw) ? (raw as DriversSubnavId) : "drivers";
}

export function parseDriverListStatus(searchParams: URLSearchParams): DriversListStatusId {
  const raw = (searchParams.get("status") ?? "all").toLowerCase();
  return (DRIVERS_LIST_STATUS_TABS as readonly { id: string }[]).some((tab) => tab.id === raw)
    ? (raw as DriversListStatusId)
    : "all";
}
