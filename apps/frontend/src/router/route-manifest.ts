export type RouteManifestEntry = {
  path: string;
  label: string;
  module: string;
  aliasOf?: string;
};

/** Single source of truth for deep-linkable app routes (AUDIT-FIX-6, extended AUDIT-FIX-14). */
export const ROUTE_MANIFEST: RouteManifestEntry[] = [
  { path: "/drivers", label: "Drivers Home", module: "drivers" },
  { path: "/drivers/roster", label: "Driver Roster", module: "drivers" },
  { path: "/drivers/profiles", label: "Driver Profiles", module: "drivers" },
  { path: "/drivers/settlements", label: "Settlements", module: "drivers" },
  { path: "/drivers/pre-settlements", label: "Pre-settlements", module: "drivers" },
  { path: "/drivers/cash-advances", label: "Cash Advances", module: "drivers" },
  { path: "/drivers/permits", label: "Permits", module: "drivers" },
  { path: "/drivers/pay-rate-templates", label: "Pay Rate Templates", module: "drivers" },
  { path: "/drivers/deductions", label: "Deductions", module: "drivers" },
  { path: "/drivers/team-splits", label: "Team Splits", module: "drivers" },
  { path: "/drivers/disputes", label: "Disputes", module: "drivers" },
  { path: "/drivers/leave", label: "Leave", module: "drivers" },
  { path: "/banking", label: "Banking Home", module: "banking" },
  { path: "/banking/bank-accounts", label: "Bank Accounts", module: "banking" },
  { path: "/banking/transactions", label: "Banking Transactions", module: "banking" },
  { path: "/banking/reconciliation", label: "Bank Reconciliation", module: "banking" },
  { path: "/banking/factoring", label: "Banking Factoring Entry", module: "banking" },
  { path: "/banking/driver-escrow", label: "Driver Escrow", module: "banking" },
  { path: "/banking/relay", label: "Relay Card", module: "banking" },
  { path: "/banking/reports", label: "Banking Reports", module: "banking" },
  { path: "/banking/statement-import", label: "Bank Statement Import", module: "banking" },
  { path: "/banking/plaid-connections", label: "Plaid Connections", module: "banking" },
  { path: "/banking/settings", label: "Banking Settings", module: "banking" },
  { path: "/maintenance", label: "Maintenance Home", module: "maintenance" },
  { path: "/maintenance/active-wos", label: "Active WOs", module: "maintenance" },
  { path: "/maintenance/fleet-table", label: "Fleet Table", module: "maintenance" },
  { path: "/maintenance/rm-status-board", label: "Maintenance Home", module: "maintenance" },
  { path: "/maintenance/home", label: "Maintenance Home", module: "maintenance" },
  { path: "/maintenance/service-location", label: "Service / Location", module: "maintenance" },
  { path: "/maintenance/arriving-soon", label: "Arriving Soon", module: "maintenance" },
  { path: "/maintenance/in-transit-issues", label: "In-Transit Issues", module: "maintenance" },
  { path: "/maintenance/damage-reports", label: "Damage Reports", module: "maintenance" },
  { path: "/maintenance/driver-reports", label: "Driver Reports", module: "maintenance" },
  { path: "/maintenance/severe-repairs", label: "Severe Repairs", module: "maintenance" },
  { path: "/maintenance/road-service", label: "Road Service", module: "maintenance" },
  { path: "/maintenance/parts-inventory", label: "Parts Inventory", module: "maintenance" },
  { path: "/maintenance/integrity-report", label: "Integrity Report", module: "maintenance" },
  { path: "/maintenance/settings", label: "Maintenance Settings", module: "maintenance" },
  { path: "/maintenance/work-orders", label: "Work Orders List", module: "maintenance" },
  { path: "/factoring", label: "Factoring Home", module: "factoring" },
  { path: "/factoring/advances/:id", label: "Factoring Advance Drawer", module: "factoring" },
  { path: "/factoring/statements", label: "Factoring Statement Tie-out", module: "factoring" },
  { path: "/factoring/recourse-pipeline", label: "Recourse Pipeline", module: "factoring" },
  { path: "/factoring/chargebacks-fees", label: "Chargebacks & Fees", module: "factoring" },
  { path: "/factoring/statements-settings", label: "Statements & Settings", module: "factoring" },
  { path: "/factoring/faro-imports", label: "Faro Daily Imports", module: "factoring" },
  { path: "/factoring/equipment-loans", label: "Equipment Loans", module: "factoring" },
  { path: "/factoring/vendor-merges", label: "Driver Vendor Merges", module: "factoring" },
  { path: "/factoring/submit", label: "Submit to Factor", module: "factoring" },
  { path: "/dispatch", label: "Dispatch Home", module: "dispatch" },
  { path: "/dispatch/map", label: "Active Load Map", module: "dispatch" },
  { path: "/dispatch/loads", label: "Loads List", module: "dispatch" },
  { path: "/dispatch/book-load", label: "Book Load", module: "dispatch" },
  { path: "/dispatch/assignments", label: "Assignments", module: "dispatch" },
  { path: "/dispatch/settlements", label: "Settlements", module: "dispatch" },
  { path: "/dispatch/pre-settlements", label: "Pre-settlements", module: "dispatch" },
  { path: "/dispatch/round-trips", label: "Round Trips", module: "dispatch" },
  { path: "/tasks", label: "Task Board", module: "tasks" },
  { path: "/tasks/calendar", label: "Calendar", module: "tasks" },
  { path: "/tasks/mine", label: "My Tasks", module: "tasks" },
  { path: "/tasks/chat", label: "Team Chat", module: "tasks" },
  { path: "/tasks/report", label: "Admin Report", module: "tasks" },
  { path: "/tasks/exceptions", label: "Exceptions", module: "tasks" },
  { path: "/finance", label: "Finance Overview", module: "finance" },
  { path: "/finance/hub", label: "Finance Hub", module: "finance" },
  { path: "/finance/projections", label: "Projections", module: "finance" },
  { path: "/finance/scenarios", label: "Scenarios", module: "finance" },
  { path: "/finance/statements", label: "Financial Statements", module: "finance" },
  { path: "/finance/ar-ap-aging", label: "AR/AP Aging", module: "finance" },
  { path: "/finance/loan-wizard", label: "Loan Wizard", module: "finance" },
  { path: "/finance/calculator", label: "Calculator", module: "finance" },
  { path: "/finance/amortization", label: "Amortization", module: "finance" },
  { path: "/inventory", label: "Parts & Stock", module: "inventory" },
  { path: "/inventory/assignments", label: "Assignments", module: "inventory" },
  { path: "/inventory/purchases", label: "Purchase History", module: "inventory" },
];

export const BANKING_TAB_PATH: Record<string, string> = {
  accounts: "/banking",
  bank_accounts: "/banking/bank-accounts",
  register: "/banking/register",
  deposits: "/banking/deposits",
  transactions: "/banking/transactions",
  link_suggestions: "/banking/link-suggestions",
  reconciliation: "/banking/reconciliation",
  driver_escrow: "/banking/driver-escrow",
  relay_card: "/banking/relay",
  reports: "/banking/reports",
  // C-64 — Statement Import + Plaid fold into + New (not tabs). Paths kept for deep links.
  statement_import: "/banking/statement-import",
  plaid_connections: "/banking/plaid-connections",
  settings: "/banking/settings",
};

export function bankingTabFromPath(pathname: string): string {
  if (pathname === "/banking/bank-accounts") return "bank_accounts";
  if (pathname.startsWith("/banking/register")) return "register";
  if (pathname.startsWith("/banking/deposits")) return "deposits";
  if (pathname === "/banking/transactions") return "transactions";
  if (pathname === "/banking/link-suggestions") return "link_suggestions";
  if (pathname === "/banking/reconciliation") return "reconciliation";
  if (pathname === "/banking/driver-escrow") return "driver_escrow";
  if (pathname === "/banking/relay") return "relay_card";
  if (pathname === "/banking/reports") return "reports";
  if (pathname === "/banking/statement-import") return "statement_import";
  if (pathname === "/banking/plaid-connections") return "plaid_connections";
  if (pathname === "/banking/settings") return "settings";
  return "accounts";
}

export const DRIVERS_SUBTAB_PATH: Record<string, string> = {
  home: "/drivers",
  roster: "/drivers/roster",
  profiles: "/drivers/profiles",
  settlements: "/drivers/settlements",
  pre_settlements: "/drivers/pre-settlements",
  cash_advances: "/drivers/cash-advances",
  cash_advance_requests: "/driver-finance/cash-advance-requests",
  pay_rate_templates: "/drivers/pay-rate-templates",
  leave: "/drivers/leave",
  team_splits: "/drivers/team-splits",
  // C-33 retired peer tabs — paths kept (Rule 07); driversSubtabFromPath remaps them.
  permits: "/drivers/permits",
  deductions: "/drivers/deductions",
  disputes: "/drivers/disputes",
};

export function driversSubtabFromPath(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  // DRV-F418 — module root is Home; roster is its own path.
  if (norm === "/drivers") return "home";
  // C-33 — Permits are unit-keyed (Safety). Deductions fold under Settlements. Disputes → hub.
  if (norm === "/drivers/permits") return "home";
  if (norm === "/drivers/deductions" || norm === "/drivers/auto-deductions") return "settlements";
  if (norm === "/drivers/disputes") return "home";
  if (norm === "/driver-finance/cash-advance-requests") return "cash_advance_requests";
  for (const [id, routePath] of Object.entries(DRIVERS_SUBTAB_PATH)) {
    if (routePath === norm) return id;
  }
  return "home";
}

export const MAINTENANCE_TAB_PATH: Record<string, string> = {
  active_wos: "/maintenance/active-wos",
  fleet_table: "/maintenance/fleet-table",
  // C-36 — Home (was "R&M Status Board"); legacy path kept (Rule 07).
  rm_status_board: "/maintenance/rm-status-board",
  home: "/maintenance/home",
  service_location: "/maintenance/service-location",
  arriving_soon: "/maintenance/arriving-soon",
  in_transit_issues: "/maintenance/in-transit-issues",
  damage_reports: "/maintenance/damage-reports",
  driver_reports: "/maintenance/driver-reports",
  severe_repairs: "/maintenance/severe-repairs",
  road_service: "/maintenance/road-service",
  parts_inventory: "/maintenance/parts-inventory",
  integrity_report: "/maintenance/integrity-report",
  // R313 Cursor item 3 — named surfaces on the primary subnav (paths were already live).
  pm_due: "/maintenance/pm-schedule",
  faults: "/maintenance/fault-code-alerts",
  in_shop: "/maintenance/fleet-table",
  cost_per_mile: "/reports/maintenance-cost-per-unit",
  // LV-MAINT-SUBNAV-ORPHAN-PATHS — retired from SUBNAV (C-36) but paths stay reachable.
  brake_wear: "/maintenance/brake-wear",
  tire_wear: "/maintenance/tire-wear",
  pre_flight_dvir: "/maintenance/pre-flight-dvir",
  predictive_alerts: "/maintenance/predictive-alerts",
  settings: "/maintenance/settings",
};

export function maintenanceTabFromPath(pathname: string): string | null {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  // Bare hub — let MaintenanceHomePage initialTab decide (Home / rm_status_board by default).
  if (norm === "/maintenance") return null;
  // C-36 remaps — retired peer tabs fold into Home or Driver Reports Kind (paths kept, Rule 07).
  if (norm === "/maintenance/home" || norm === "/maintenance/rm-status-board") return "rm_status_board";
  if (norm === "/maintenance/arriving-soon" || norm === "/maintenance/predictive-alerts") return "rm_status_board";
  if (norm === "/maintenance/brake-wear" || norm === "/maintenance/tire-wear") return "rm_status_board";
  if (norm === "/maintenance/severe-repairs") return "active_wos"; // Severe is the red kanban column, not a tab
  if (norm === "/maintenance/in-transit" || norm === "/maintenance/triage" || norm === "/maintenance/in-transit-issues") {
    return "driver_reports";
  }
  if (norm.includes("in-transit")) return "driver_reports";
  if (norm === "/maintenance/damage-reports") return "driver_reports";
  // DVIR belongs to Safety; defects tagged DVIR surface under Driver Reports Kind=DVIR.
  if (norm === "/maintenance/dvir" || norm === "/maintenance/pre-flight-dvir") return "driver_reports";
  if (norm === "/maintenance/integrity-report") return "integrity_report";
  // R313 #3 — primary surfaces that live outside MaintenanceHome tab panels.
  if (norm === "/maintenance/pm-schedule") return "pm_due";
  if (norm === "/maintenance/fault-code-alerts" || norm.startsWith("/maintenance/fault-code-alerts/")) return "faults";
  if (norm === "/maintenance/defects" || norm.startsWith("/maintenance/defects/")) return "faults";
  if (norm === "/reports/maintenance-cost-per-unit") return "cost_per_mile";
  for (const [id, routePath] of Object.entries(MAINTENANCE_TAB_PATH)) {
    if (routePath === norm) return id;
  }
  return null;
}

// FAC-09a (owner 2026-09-08, "CORRECTED FROM REAL SCREENSHOTS"): the real Faro debtor portal
// has 15 nav items, in this exact order — rebuilt here to match. The 5 pre-existing internal-ops
// tabs (reserve_tracker/statements_settings/faro_imports/equipment_loans/vendor_merges) are kept
// reachable (Rule 07 — never delete) under the "Internal Tools" dropdown rather than deleted;
// they are a different kind of tool (internal ops actions) than the 15-item debtor-facing report
// list the owner's screenshots describe, so they are additive, not folded into the 15.
export const FACTORING_TAB_PATH: Record<string, string> = {
  submit_invoice: "/factoring/submit-invoice",
  request_debtor_credit_check: "/factoring/request-debtor-credit-check",
  funds_due: "/factoring/funds-due",
  payments_to_you: "/factoring/payments-to-you",
  debtor_receipts: "/factoring/debtor-receipts",
  purchase_report: "/factoring/purchase-report",
  account_summary: "/factoring/account-summary",
  fees_paid: "/factoring/fees-paid",
  aging: "/factoring/aging",
  reserve: "/factoring/reserve",
  escrow_account: "/factoring/escrow-account",
  cash_reserve: "/factoring/cash-reserve",
  chargebacks_overpayments: "/factoring/chargebacks-overpayments",
  loan_save: "/factoring/loan-save",
  unapplied_cash: "/factoring/unapplied-cash",
  invoice_status_report: "/factoring/invoice-status-report",
  messages_support: "/factoring/messages-support",
  // Internal-ops tabs (pre-existing, kept reachable under "Internal Tools" — not deleted).
  recourse_pipeline: "/factoring/recourse-pipeline",
  chargebacks_fees: "/factoring/chargebacks-fees",
  statements_settings: "/factoring/statements-settings",
  faro_imports: "/factoring/faro-imports",
  equipment_loans: "/factoring/equipment-loans",
  vendor_merges: "/factoring/vendor-merges",
  reserve_tracker: "/factoring/reserve-tracker",
};

export function factoringTabFromPath(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (norm === "/factoring") return "submit_invoice";
  for (const [id, routePath] of Object.entries(FACTORING_TAB_PATH)) {
    if (routePath === norm) return id;
  }
  return "aging";
}

export const DISPATCH_SECONDARY_TAB_PATH: Record<string, string> = {
  load_board: "/dispatch",
  book_load: "/dispatch/book-load",
  load_costs: "/dispatch/load-costs",
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
  integrity: "/fuel/integrity",
  cards: "/fuel/cards",
  relay_unmatched: "/fuel/relay-unmatched",
};

export function fuelTabFromPath(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  // Live operators + Devin still hit the hyphen alias; map it to the canonical inbox leaf.
  if (norm === "/fuel/relay-inbox") return "relay_inbox";
  for (const [id, routePath] of Object.entries(FUEL_TAB_PATH)) {
    if (routePath === norm) return id;
  }
  return "planner";
}
