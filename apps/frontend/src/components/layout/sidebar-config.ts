import type { ComponentType } from "react";
import {
  Activity,
  Banknote,
  BarChart2,
  Building2,
  Calculator,
  CarFront,
  CircleHelp,
  FileText,
  Home,
  ListChecks,
  Radio,
  Scale,
  ShieldCheck,
  SquareStack,
  Truck,
  UserCog,
} from "lucide-react";
import type { UserRole } from "../../types/api";

/** Canonical sidebar ids (locked; single source for order + prefs overrides). */
export const SIDEBAR_ITEM_IDS = [
  "home",
  "maintenance",
  "fuel",
  "dispatch",
  "drivers",
  "safety",
  "accounting",
  "bank",
  "factoring",
  "customers",
  "vendors",
  "lists",
  "reports",
  "legal",
  "docs",
  "eld",
  "form_425",
  "drv_app",
  "users",
  "help",
] as const;

export type SidebarItemId = (typeof SIDEBAR_ITEM_IDS)[number];

export const SIDEBAR_DEFAULT_ORDER: readonly SidebarItemId[] = SIDEBAR_ITEM_IDS;

const DEFAULT_ORDER_SET = new Set<string>(SIDEBAR_DEFAULT_ORDER);

export type SidebarFlyoutLink = { label: string; to: string };

export type SidebarItemMeta = {
  id: SidebarItemId;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  to: string;
  visibleRoles?: UserRole[];
  dataTour?: string;
  badgeKey?: "maintenance_severe";
};

/** Per-item presentation + routes. Order is controlled only by `SIDEBAR_DEFAULT_ORDER` / role / user prefs. */
export const SIDEBAR_ITEM_META: Record<SidebarItemId, SidebarItemMeta> = {
  home: { id: "home", label: "HOME", Icon: Home, to: "/home", dataTour: "tour-nav-home" },
  maintenance: {
    id: "maintenance",
    label: "MAINT",
    Icon: CarFront,
    to: "/maintenance",
    badgeKey: "maintenance_severe",
  },
  fuel: { id: "fuel", label: "FUEL", Icon: CarFront, to: "/fuel" },
  dispatch: { id: "dispatch", label: "DISPATCH", Icon: Truck, to: "/dispatch", dataTour: "tour-nav-dispatch" },
  drivers: { id: "drivers", label: "DRIVERS", Icon: Truck, to: "/drivers" },
  safety: { id: "safety", label: "SAFETY", Icon: ShieldCheck, to: "/safety" },
  accounting: { id: "accounting", label: "ACCTG", Icon: Calculator, to: "/accounting" },
  bank: { id: "bank", label: "BANK", Icon: Banknote, to: "/banking", dataTour: "tour-nav-banking" },
  factoring: { id: "factoring", label: "FACT", Icon: Calculator, to: "/accounting/factoring" },
  customers: { id: "customers", label: "CUSTOMERS", Icon: Building2, to: "/customers", dataTour: "tour-nav-customers" },
  vendors: { id: "vendors", label: "VENDORS", Icon: Building2, to: "/vendors" },
  lists: { id: "lists", label: "LISTS", Icon: ListChecks, to: "/lists" },
  reports: { id: "reports", label: "REPORTS", Icon: BarChart2, to: "/reports" },
  legal: { id: "legal", label: "LEGAL", Icon: Scale, to: "/legal", visibleRoles: ["Owner", "Administrator"] },
  docs: { id: "docs", label: "DOCS", Icon: FileText, to: "/documents", visibleRoles: ["Owner", "Administrator"] },
  eld: { id: "eld", label: "ELD", Icon: Radio, to: "/integrations/samsara", visibleRoles: ["Owner"] },
  form_425: { id: "form_425", label: "425C", Icon: SquareStack, to: "/425c" },
  drv_app: { id: "drv_app", label: "DRV APP", Icon: Activity, to: "/driver-app" },
  users: {
    id: "users",
    label: "USERS",
    Icon: UserCog,
    to: "/users",
    visibleRoles: ["Owner", "Administrator", "SuperAdmin"],
    dataTour: "tour-nav-admin",
  },
  help: { id: "help", label: "HELP", Icon: CircleHelp, to: "/help" },
};

export function mergeSidebarOrder(preferred: readonly SidebarItemId[], defaults: readonly SidebarItemId[]): SidebarItemId[] {
  const seen = new Set<SidebarItemId>();
  const out: SidebarItemId[] = [];
  for (const id of preferred) {
    if (!DEFAULT_ORDER_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of defaults) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function parseUserOverride(raw: unknown): SidebarItemId[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = raw.filter((x): x is SidebarItemId => typeof x === "string" && DEFAULT_ORDER_SET.has(x));
  return ids.length > 0 ? ids : null;
}

/** Role-first ordering; remaining ids append from `SIDEBAR_DEFAULT_ORDER`. Owner / Administrator / SuperAdmin use defaults only (no entry here). */
export const SIDEBAR_ROLE_ORDER: Partial<Record<UserRole, readonly SidebarItemId[]>> = {
  Mechanic: ["home", "maintenance", "fuel", "drivers", "safety", "lists", "docs", "eld", "reports", "drv_app", "users", "help"],
  Dispatcher: ["home", "dispatch", "drivers", "fuel", "safety", "maintenance", "customers", "vendors", "lists", "reports", "help"],
  Accountant: ["home", "accounting", "bank", "factoring", "vendors", "customers", "drivers", "fuel", "reports", "lists", "form_425", "legal", "docs", "help"],
  Safety: ["home", "safety", "drivers", "maintenance", "dispatch", "fuel", "lists", "reports", "help", "users"],
  Manager: ["home", "dispatch", "drivers", "maintenance", "fuel", "customers", "vendors", "safety", "lists", "reports", "help", "users"],
};

export function resolveSidebarOrder(role: UserRole, preferences: Record<string, unknown> | undefined): SidebarItemId[] {
  const override = parseUserOverride(preferences?.sidebar_order);
  if (override) return mergeSidebarOrder(override, SIDEBAR_DEFAULT_ORDER);

  const roleFirst = SIDEBAR_ROLE_ORDER[role];
  if (roleFirst?.length) return mergeSidebarOrder(roleFirst, SIDEBAR_DEFAULT_ORDER);

  return [...SIDEBAR_DEFAULT_ORDER];
}

/** Flyout targets — Fuel + fleet routes live under existing modules (no top-level FUEL / DRIVERS). */
export function getSidebarFlyoutItems(id: SidebarItemId, role: UserRole): SidebarFlyoutLink[] {
  switch (id) {
    case "accounting":
      return [
        { label: "Hub", to: "/accounting" },
        { label: "Invoices", to: "/accounting/invoices" },
        { label: "Payments", to: "/accounting/payments" },
        { label: "Factoring", to: "/accounting/factoring" },
      ];
    case "maintenance":
      return [
        { label: "Dashboard", to: "/maintenance" },
        { label: "Severe Repairs", to: "/maintenance?tab=severe" },
      ];
    case "bank":
      return [
        { label: "Overview", to: "/banking" },
        { label: "Reconcile", to: "/banking/reconcile" },
        { label: "Transfers", to: "/banking/transfers" },
        { label: "Fuel Planner", to: "/fuel" },
      ];
    case "safety":
      return [
        { label: "Driver Files", to: "/safety/driver-files" },
        { label: "DOT Inspections", to: "/safety/dot-inspections" },
      ];
    case "dispatch":
      return [
        { label: "Dispatch Home", to: "/dispatch" },
        { label: "Loads", to: "/dispatch?view=loads" },
        { label: "Geofencing", to: "/dispatch/geofencing" },
        { label: "Alerts", to: "/dispatch/alerts" },
        { label: "Daily Tasks", to: "/daily-tasks" },
        { label: "Drivers", to: "/drivers" },
        { label: "Settlements", to: "/driver-finance/settlements" },
      ];
    case "legal":
      return [
        { label: "Contracts", to: "/legal/contracts" },
        { label: "Templates", to: "/legal/templates" },
        { label: "Policies", to: "/legal/policies" },
        { label: "Attorney Review", to: "/legal/attorney-review" },
      ];
    case "users": {
      const rows: SidebarFlyoutLink[] = [{ label: "Users", to: "/users" }];
      if (role === "Owner") {
        rows.push(
          { label: "Migration Status", to: "/admin/migration-status" },
          { label: "Integrity checks", to: "/admin/integrity" },
          { label: "Error monitor", to: "/admin/error-monitor" }
        );
      }
      if (role === "Owner" || role === "SuperAdmin") {
        rows.push({ label: "Activity log", to: "/admin/activity" });
      }
      return rows;
    }
    default:
      return [];
  }
}
