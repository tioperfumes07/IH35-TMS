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
  Fuel as FuelIcon,
  Home,
  ListChecks,
  Radio,
  Scale,
  ShieldCheck,
  SquareStack,
  Truck,
  Users,
  UserCog,
} from "lucide-react";
import type { UserRole } from "../../types/api";

/** Canonical sidebar ids (locked; single source for order + prefs overrides). */
export const SIDEBAR_ITEM_IDS = [
  "home",
  "maintenance",
  "dispatch",
  "safety",
  "drivers",
  "accounting",
  "bank",
  "fuel",
  "factoring",
  "pay",
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
  dispatch: { id: "dispatch", label: "DISPATCH", Icon: Truck, to: "/dispatch", dataTour: "tour-nav-dispatch" },
  safety: { id: "safety", label: "SAFETY", Icon: ShieldCheck, to: "/safety" },
  drivers: { id: "drivers", label: "DRIVERS", Icon: Users, to: "/drivers" },
  accounting: { id: "accounting", label: "ACCTG", Icon: Calculator, to: "/accounting" },
  bank: { id: "bank", label: "BANK", Icon: Banknote, to: "/banking", dataTour: "tour-nav-banking" },
  fuel: { id: "fuel", label: "FUEL", Icon: FuelIcon, to: "/fuel" },
  factoring: { id: "factoring", label: "FACT", Icon: Calculator, to: "/accounting/factoring" },
  pay: { id: "pay", label: "PAY", Icon: Calculator, to: "/accounting/payments" },
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
  Mechanic: ["home", "maintenance", "safety", "lists", "docs", "eld", "reports", "drv_app", "users", "help"],
  Dispatcher: ["home", "dispatch", "safety", "maintenance", "customers", "vendors", "lists", "reports", "help"],
  Accountant: ["home", "accounting", "bank", "factoring", "pay", "vendors", "customers", "reports", "lists", "form_425", "legal", "docs", "help"],
  Safety: ["home", "safety", "maintenance", "dispatch", "lists", "reports", "help", "users"],
  Manager: ["home", "dispatch", "maintenance", "customers", "vendors", "safety", "lists", "reports", "help", "users"],
};

export function resolveSidebarOrder(role: UserRole, preferences: Record<string, unknown> | undefined): SidebarItemId[] {
  const override = parseUserOverride(preferences?.sidebar_order);
  if (override) return mergeSidebarOrder(override, SIDEBAR_DEFAULT_ORDER);

  const roleFirst = SIDEBAR_ROLE_ORDER[role];
  if (roleFirst?.length) return mergeSidebarOrder(roleFirst, SIDEBAR_DEFAULT_ORDER);

  return [...SIDEBAR_DEFAULT_ORDER];
}

/** Flyout targets for sidebar hover menus. */
export function getSidebarFlyoutItems(id: SidebarItemId, role: UserRole): SidebarFlyoutLink[] {
  switch (id) {
    case "accounting":
      return [
        { label: "Hub", to: "/accounting" },
        { label: "Invoices", to: "/accounting/invoices" },
        { label: "Payments", to: "/accounting/payments" },
        { label: "Factoring", to: "/accounting/factoring" },
      ];
    case "pay":
      return [{ label: "Record Payment", to: "/accounting/payments" }];
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
        { label: "Alerts", to: "/dispatch/alerts" },
        { label: "Daily Tasks", to: "/daily-tasks" },
        { label: "Settlements", to: "/driver-finance/settlements" },
      ];
    case "drivers":
      return [{ label: "Drivers", to: "/drivers" }];
    case "fuel":
      return [{ label: "Fuel Planner", to: "/fuel" }];
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
