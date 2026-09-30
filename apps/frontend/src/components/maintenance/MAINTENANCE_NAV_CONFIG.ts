export type MaintenanceNavLink = { label: string; path: string };

/** Sidebar flyout destinations — module-level nav (13). */
export const MAINTENANCE_MODULE_NAV_LINKS: MaintenanceNavLink[] = [
  { label: "Dashboard", path: "/maintenance" },
  { label: "Vehicles", path: "/maintenance/vehicles" },
  { label: "Drivers", path: "/maintenance/drivers" },
  { label: "Parts", path: "/maintenance/parts" },
  { label: "Severe Repairs", path: "/maintenance/severe-repairs" },
  { label: "PM Schedule", path: "/maintenance/pm-schedule" },
  { label: "Inspections", path: "/maintenance/inspections" },
  { label: "Vendors", path: "/maintenance/vendors" },
  { label: "Reports", path: "/maintenance/reports" },
  { label: "Compliance", path: "/maintenance/compliance" },
  { label: "Position History", path: "/maintenance/position-history" },
  { label: "Fault Drafts", path: "/maintenance/fault-drafts" },
  { label: "Fault Rules", path: "/maintenance/fault-rules" },
];

/** Master Data hover dropdown — excludes Dashboard + operational-only tabs (11). */
export const MAINTENANCE_MASTER_DATA_LINKS: MaintenanceNavLink[] = [
  { label: "Vehicles", path: "/maintenance/vehicles" },
  { label: "Drivers", path: "/maintenance/drivers" },
  { label: "Parts", path: "/maintenance/parts" },
  { label: "PM Schedule", path: "/maintenance/pm-schedule" },
  { label: "Inspections", path: "/maintenance/inspections" },
  { label: "Vendors", path: "/maintenance/vendors" },
  { label: "Reports", path: "/maintenance/reports" },
  { label: "Compliance", path: "/maintenance/compliance" },
  { label: "Position History", path: "/maintenance/position-history" },
  { label: "Fault Drafts", path: "/maintenance/fault-drafts" },
  { label: "Fault Rules", path: "/maintenance/fault-rules" },
];

/** Dashboard operational sub-tabs — C-36 owner canvas (9). */
export const MAINTENANCE_DASHBOARD_TAB_LINKS: MaintenanceNavLink[] = [
  { label: "Home", path: "/maintenance/rm-status-board" },
  { label: "Fleet Table", path: "/maintenance/fleet-table" },
  { label: "Active WOs", path: "/maintenance/active-wos" },
  { label: "Service / Location", path: "/maintenance/service-location" },
  { label: "Driver Reports", path: "/maintenance/driver-reports" },
  { label: "Road Service", path: "/maintenance/road-service" },
  { label: "Parts Inventory", path: "/maintenance/parts-inventory" },
  { label: "Integrity Report", path: "/maintenance/integrity-report" },
  { label: "Settings", path: "/maintenance/settings" },
];

/** Operation links table (dashboard home + operational tabs = 10). */
export const MAINTENANCE_OPERATION_LINKS: MaintenanceNavLink[] = [
  { label: "Home", path: "/maintenance" },
  ...MAINTENANCE_DASHBOARD_TAB_LINKS,
];

/** Lists → Maintenance catalogs (AllCatalogsMap maintenance domain). */
// LST-WIRE-03 — 10 → 18. Eight maintenance catalogs were unrouted and untiled (air bag, battery,
// PM intervals, repair locations, tire, trailer parts, truck parts, work order templates); they are
// now wired end-to-end and appear on the Lists hub.
export const MAINTENANCE_LISTS_CATALOG_COUNT = 21;

export const MAINTENANCE_MODULE_NAV_COUNT = MAINTENANCE_MODULE_NAV_LINKS.length;
export const MAINTENANCE_MASTER_DATA_NAV_COUNT = MAINTENANCE_MASTER_DATA_LINKS.length;
export const MAINTENANCE_DASHBOARD_TAB_COUNT = MAINTENANCE_DASHBOARD_TAB_LINKS.length;
export const MAINTENANCE_HOME_QUICK_JUMP_COUNT = MAINTENANCE_MODULE_NAV_COUNT;
