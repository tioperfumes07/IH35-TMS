export type MaintenanceNavLink = { label: string; path: string };

/** Sidebar flyout destinations — module-level nav (10). */
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
];

/** Master Data hover dropdown — excludes Dashboard + operational-only tabs (8). */
export const MAINTENANCE_MASTER_DATA_LINKS: MaintenanceNavLink[] = [
  { label: "Vehicles", path: "/maintenance/vehicles" },
  { label: "Drivers", path: "/maintenance/drivers" },
  { label: "Parts", path: "/maintenance/parts" },
  { label: "PM Schedule", path: "/maintenance/pm-schedule" },
  { label: "Inspections", path: "/maintenance/inspections" },
  { label: "Vendors", path: "/maintenance/vendors" },
  { label: "Reports", path: "/maintenance/reports" },
  { label: "Compliance", path: "/maintenance/compliance" },
];

/** Dashboard operational sub-tabs — guarded by verify:maintenance-tab-coverage (10). */
export const MAINTENANCE_DASHBOARD_TAB_LINKS: MaintenanceNavLink[] = [
  { label: "Active WOs", path: "/maintenance/active-wos" },
  { label: "Fleet Table", path: "/maintenance/fleet-table" },
  { label: "R&M Status Board", path: "/maintenance/rm-status-board" },
  { label: "Service / Location", path: "/maintenance/service-location" },
  { label: "Arriving Soon", path: "/maintenance/arriving-soon" },
  { label: "In-Transit Issues", path: "/maintenance/in-transit-issues" },
  { label: "Damage Reports", path: "/maintenance/damage-reports" },
  { label: "Severe Repairs", path: "/maintenance/severe-repairs" },
  { label: "Parts Inventory", path: "/maintenance/parts-inventory" },
  { label: "Settings", path: "/maintenance/settings" },
];

/** Operation links table (dashboard home + operational tabs = 11). */
export const MAINTENANCE_OPERATION_LINKS: MaintenanceNavLink[] = [
  { label: "Dashboard", path: "/maintenance" },
  ...MAINTENANCE_DASHBOARD_TAB_LINKS,
];

/** Lists → Maintenance catalogs (AllCatalogsMap maintenance domain). */
export const MAINTENANCE_LISTS_CATALOG_COUNT = 9;

export const MAINTENANCE_MODULE_NAV_COUNT = MAINTENANCE_MODULE_NAV_LINKS.length;
export const MAINTENANCE_MASTER_DATA_NAV_COUNT = MAINTENANCE_MASTER_DATA_LINKS.length;
export const MAINTENANCE_DASHBOARD_TAB_COUNT = MAINTENANCE_DASHBOARD_TAB_LINKS.length;
export const MAINTENANCE_HOME_QUICK_JUMP_COUNT = MAINTENANCE_MODULE_NAV_COUNT;
