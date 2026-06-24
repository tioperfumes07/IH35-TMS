export type RouteManifestEntry = {
  path: string;
  label: string;
  module: string;
  aliasOf?: string;
};

/** Single source of truth for deep-linkable app routes (AUDIT-FIX-6, extended AUDIT-FIX-14). */
export const ROUTE_MANIFEST: RouteManifestEntry[] = [
  { path: "/drivers", label: "Drivers Home", module: "drivers" },
  { path: "/drivers/profiles", label: "Driver Profiles", module: "drivers" },
  { path: "/drivers/settlements", label: "Settlements", module: "drivers" },
  { path: "/drivers/pre-settlements", label: "Pre-settlements", module: "drivers" },
  { path: "/drivers/cash-advances", label: "Cash Advances", module: "drivers" },
  { path: "/drivers/permits", label: "Permits", module: "drivers" },
  { path: "/drivers/pay-rate-templates", label: "Pay Rate Templates", module: "drivers" },
  { path: "/drivers/deductions", label: "Deductions", module: "drivers" },
  { path: "/drivers/disputes", label: "Disputes", module: "drivers" },
  { path: "/drivers/leave", label: "Leave", module: "drivers" },
  { path: "/banking", label: "Banking Home", module: "banking" },
  { path: "/banking/transactions", label: "Banking Transactions", module: "banking" },
  { path: "/banking/reconciliation", label: "Bank Reconciliation", module: "banking" },
  { path: "/banking/driver-escrow", label: "Driver Escrow", module: "banking" },
  { path: "/banking/reports", label: "Banking Reports", module: "banking" },
  { path: "/maintenance", label: "Maintenance Home", module: "maintenance" },
  { path: "/maintenance/active-wos", label: "Active WOs", module: "maintenance" },
  { path: "/maintenance/fleet-table", label: "Fleet Table", module: "maintenance" },
  { path: "/maintenance/rm-status-board", label: "R&M Status Board", module: "maintenance" },
  { path: "/maintenance/service-location", label: "Service / Location", module: "maintenance" },
  { path: "/maintenance/arriving-soon", label: "Arriving Soon", module: "maintenance" },
  { path: "/maintenance/in-transit-issues", label: "In-Transit Issues", module: "maintenance" },
  { path: "/maintenance/damage-reports", label: "Damage Reports", module: "maintenance" },
  { path: "/maintenance/severe-repairs", label: "Severe Repairs", module: "maintenance" },
  { path: "/maintenance/road-service", label: "Road Service", module: "maintenance" },
  { path: "/maintenance/parts-inventory", label: "Parts Inventory", module: "maintenance" },
  { path: "/maintenance/settings", label: "Maintenance Settings", module: "maintenance" },
  { path: "/maintenance/work-orders", label: "Work Orders List", module: "maintenance" },
  { path: "/factoring", label: "Factoring Home", module: "factoring" },
  { path: "/factoring/recourse-pipeline", label: "Recourse Pipeline", module: "factoring" },
  { path: "/factoring/chargebacks-fees", label: "Chargebacks & Fees", module: "factoring" },
  { path: "/factoring/statements-settings", label: "Statements & Settings", module: "factoring" },
  { path: "/factoring/faro-imports", label: "Faro Daily Imports", module: "factoring" },
  { path: "/factoring/equipment-loans", label: "Equipment Loans", module: "factoring" },
  { path: "/factoring/vendor-merges", label: "Driver Vendor Merges", module: "factoring" },
  { path: "/dispatch", label: "Dispatch Home", module: "dispatch" },
  { path: "/dispatch/map", label: "Active Load Map", module: "dispatch" },
  { path: "/dispatch/loads", label: "Loads List", module: "dispatch" },
  { path: "/dispatch/book-load", label: "Book Load", module: "dispatch" },
  { path: "/dispatch/assignments", label: "Assignments", module: "dispatch" },
  { path: "/dispatch/settlements", label: "Settlements", module: "dispatch" },
  { path: "/dispatch/pre-settlements", label: "Pre-settlements", module: "dispatch" },
  { path: "/tasks", label: "Task Board", module: "tasks" },
  { path: "/tasks/calendar", label: "Calendar", module: "tasks" },
  { path: "/tasks/mine", label: "My Tasks", module: "tasks" },
  { path: "/tasks/chat", label: "Team Chat", module: "tasks" },
  { path: "/tasks/report", label: "Admin Report", module: "tasks" },
  { path: "/finance", label: "Finance Overview", module: "finance" },
  { path: "/finance/projections", label: "Projections", module: "finance" },
  { path: "/finance/scenarios", label: "Scenarios", module: "finance" },
  { path: "/inventory", label: "Parts & Stock", module: "inventory" },
  { path: "/inventory/assignments", label: "Assignments", module: "inventory" },
  { path: "/inventory/purchases", label: "Purchase History", module: "inventory" },
];

export const BANKING_TAB_PATH: Record<string, string> = {
  accounts: "/banking",
  transactions: "/banking/transactions",
  reconciliation: "/banking/reconciliation",
  driver_escrow: "/banking/driver-escrow",
  reports: "/banking/reports",
};

export function bankingTabFromPath(pathname: string): string {
  if (pathname === "/banking/transactions") return "transactions";
  if (pathname === "/banking/reconciliation") return "reconciliation";
  if (pathname === "/banking/driver-escrow") return "driver_escrow";
  if (pathname === "/banking/reports") return "reports";
  return "accounts";
}

export const DRIVERS_SUBTAB_PATH: Record<string, string> = {
  drivers: "/drivers",
  profiles: "/drivers/profiles",
  settlements: "/drivers/settlements",
  pre_settlements: "/drivers/pre-settlements",
  cash_advances: "/drivers/cash-advances",
  permits: "/drivers/permits",
  pay_rate_templates: "/drivers/pay-rate-templates",
  deductions: "/drivers/deductions",
  disputes: "/drivers/disputes",
  leave: "/drivers/leave",
};

export function driversSubtabFromPath(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  for (const [id, routePath] of Object.entries(DRIVERS_SUBTAB_PATH)) {
    if (routePath === norm) return id;
  }
  return "drivers";
}

export const MAINTENANCE_TAB_PATH: Record<string, string> = {
  active_wos: "/maintenance/active-wos",
  fleet_table: "/maintenance/fleet-table",
  rm_status_board: "/maintenance/rm-status-board",
  service_location: "/maintenance/service-location",
  arriving_soon: "/maintenance/arriving-soon",
  in_transit_issues: "/maintenance/in-transit-issues",
  damage_reports: "/maintenance/damage-reports",
  driver_reports: "/maintenance/driver-reports",
  severe_repairs: "/maintenance/severe-repairs",
  road_service: "/maintenance/road-service",
  parts_inventory: "/maintenance/parts-inventory",
  settings: "/maintenance/settings",
};

export function maintenanceTabFromPath(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (norm === "/maintenance") return "active_wos";
  if (norm === "/maintenance/in-transit" || norm === "/maintenance/triage") return "in_transit_issues";
  for (const [id, routePath] of Object.entries(MAINTENANCE_TAB_PATH)) {
    if (routePath === norm) return id;
  }
  return "active_wos";
}

export const FACTORING_TAB_PATH: Record<string, string> = {
  recourse_pipeline: "/factoring/recourse-pipeline",
  chargebacks_fees: "/factoring/chargebacks-fees",
  statements_settings: "/factoring/statements-settings",
  faro_imports: "/factoring/faro-imports",
  equipment_loans: "/factoring/equipment-loans",
  vendor_merges: "/factoring/vendor-merges",
};

export function factoringTabFromPath(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (norm === "/factoring") return "recourse_pipeline";
  for (const [id, routePath] of Object.entries(FACTORING_TAB_PATH)) {
    if (routePath === norm) return id;
  }
  return "recourse_pipeline";
}

export const DISPATCH_SECONDARY_TAB_PATH: Record<string, string> = {
  load_board: "/dispatch",
  book_load: "/dispatch/book-load",
  assignments: "/dispatch/assignments",
  settlements: "/dispatch/settlements",
  pre_settlements: "/dispatch/pre-settlements",
};

export function dispatchSecondaryTabFromPath(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (norm === "/dispatch/loads") return "load_board";
  for (const [id, routePath] of Object.entries(DISPATCH_SECONDARY_TAB_PATH)) {
    if (routePath === norm) return id;
  }
  return "load_board";
}

export const FUEL_TAB_PATH: Record<string, string> = {
  home: "/fuel",
  planner: "/fuel/planner",
  relay_inbox: "/fuel/inbox",
  settings: "/fuel/settings",
  expense_mapping: "/fuel/expense-mapping",
  history: "/fuel/history",
  loves_prices: "/fuel/loves-prices",
  compliance: "/fuel/compliance",
};

export function fuelTabFromPath(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  for (const [id, routePath] of Object.entries(FUEL_TAB_PATH)) {
    if (routePath === norm) return id;
  }
  return "planner";
}
