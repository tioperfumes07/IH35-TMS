export type RouteManifestEntry = {
  path: string;
  label: string;
  module: string;
  aliasOf?: string;
};

/** Single source of truth for deep-linkable app routes (AUDIT-FIX-6). */
export const ROUTE_MANIFEST: RouteManifestEntry[] = [
  { path: "/banking", label: "Banking Home", module: "banking" },
  { path: "/banking/transactions", label: "Banking Transactions", module: "banking" },
  { path: "/banking/reconciliation", label: "Bank Reconciliation", module: "banking" },
  { path: "/banking/driver-escrow", label: "Driver Escrow", module: "banking" },
  { path: "/banking/reports", label: "Banking Reports", module: "banking" },
  { path: "/maintenance", label: "Maintenance Home", module: "maintenance" },
  { path: "/maintenance/work-orders", label: "Work Orders List", module: "maintenance" },
  { path: "/maintenance/active-wos", label: "Active WOs", module: "maintenance" },
  { path: "/maintenance/fleet-table", label: "Fleet Table", module: "maintenance" },
  { path: "/dispatch", label: "Dispatch Home", module: "dispatch" },
  { path: "/dispatch/loads", label: "Loads List", module: "dispatch" },
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
