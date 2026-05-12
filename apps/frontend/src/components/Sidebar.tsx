import {
  Activity,
  Banknote,
  Building2,
  Calculator,
  CarFront,
  ClipboardList,
  FileText,
  Fuel,
  Home,
  ShieldCheck,
  ListChecks,
  Scale,
  SquareStack,
  Truck,
  Users,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { getArrivingSoon } from "../api/maintenance";
import { useCompanyContext } from "../contexts/CompanyContext";
import { spacing } from "../design/tokens";
import type { UserRole } from "../types/api";
import { SidebarFlyoutMenu } from "./SidebarFlyoutMenu";

type SidebarItem = {
  key: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  to: string;
  visibleRoles?: UserRole[];
};

const ITEMS: SidebarItem[] = [
  { key: "HOME", label: "HOME", Icon: Home, to: "/home" },
  { key: "MAINT", label: "MAINT", Icon: CarFront, to: "/maintenance" },
  { key: "ACCTG", label: "ACCTG", Icon: Calculator, to: "/accounting/invoices" },
  { key: "PAYMENTS", label: "PAY", Icon: Calculator, to: "/accounting/payments" },
  { key: "FACTORING", label: "FACT", Icon: Calculator, to: "/accounting/factoring" },
  { key: "BANK", label: "BANK", Icon: Banknote, to: "/banking" },
  { key: "FUEL", label: "FUEL", Icon: Fuel, to: "/fuel" },
  { key: "SAFETY", label: "SAFETY", Icon: ShieldCheck, to: "/safety" },
  { key: "DRIVERS", label: "DRIVERS", Icon: Users, to: "/drivers" },
  { key: "CUSTOMERS", label: "CUSTOMERS", Icon: Building2, to: "/customers" },
  { key: "DISPATCH", label: "DISPATCH", Icon: Truck, to: "/dispatch" },
  { key: "VENDORS", label: "VENDORS", Icon: Building2, to: "/vendors" },
  { key: "DOCUMENTS", label: "DOCS", Icon: FileText, to: "/documents", visibleRoles: ["Owner", "Administrator"] },
  { key: "LISTS", label: "LISTS", Icon: ListChecks, to: "/lists" },
  { key: "REPORTS", label: "REPORTS", Icon: ClipboardList, to: "/reports" },
  { key: "LEGAL", label: "LEGAL", Icon: Scale, to: "/legal", visibleRoles: ["Owner", "Administrator"] },
  { key: "425C", label: "425C", Icon: SquareStack, to: "/425c" },
  { key: "DRV_APP", label: "DRV APP", Icon: Activity, to: "/driver-app" },
];

type SidebarProps = {
  role: UserRole;
};

export function Sidebar({ role }: SidebarProps) {
  const location = useLocation();
  const { selectedCompanyId } = useCompanyContext();
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const severeArrivingSoonQuery = useQuery({
    queryKey: ["sidebar", "maintenance-severe-badge", selectedCompanyId ?? ""],
    queryFn: () =>
      getArrivingSoon({
        operating_company_id: selectedCompanyId!,
        within_hours: 48,
        severity_min: "severe",
        include_already_arrived: true,
        include_non_yard_destination: true,
      }),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 60_000,
  });

  const severeBadgeCount = Number(severeArrivingSoonQuery.data?.counts?.severe ?? 0);
  const visibleItems = ITEMS.filter((item) => !item.visibleRoles || item.visibleRoles.includes(role));
  const flyoutLinksByKey: Record<string, Array<{ label: string; to: string }>> = {
    ACCTG: [
      { label: "Invoices", to: "/accounting/invoices" },
      { label: "Payments", to: "/accounting/payments" },
      { label: "Factoring", to: "/accounting/factoring" },
    ],
    PAYMENTS: [{ label: "Record Payment", to: "/accounting/payments" }],
    MAINT: [
      { label: "Dashboard", to: "/maintenance" },
      { label: "Severe Repairs", to: "/maintenance?tab=severe" },
    ],
    BANK: [
      { label: "Overview", to: "/banking" },
      { label: "Transfers", to: "/banking/transfers" },
    ],
    FUEL: [{ label: "Fuel Planner", to: "/fuel" }],
    SAFETY: [
      { label: "Driver Files", to: "/safety/driver-files" },
      { label: "DOT Inspections", to: "/safety/dot-inspections" },
    ],
    DRIVERS: [
      { label: "Drivers", to: "/drivers" },
      { label: "Settlements", to: "/driver-finance/settlements" },
    ],
    DISPATCH: [
      { label: "Dispatch Home", to: "/dispatch" },
      { label: "Loads", to: "/dispatch?view=loads" },
    ],
    LEGAL: [
      { label: "Contracts", to: "/legal/contracts" },
      { label: "Templates", to: "/legal/templates" },
      { label: "Policies", to: "/legal/policies" },
      { label: "Attorney Review", to: "/legal/attorney-review" },
    ],
  };

  return (
    <aside
      className="shrink-0 text-white"
      style={{ width: 80, background: "rgb(27, 35, 51)", borderRight: "1px solid rgb(42, 50, 66)" }}
    >
      <div className="flex h-full flex-col items-center gap-1 py-2">
        {visibleItems.map(({ key, label, Icon, to }) => {
          const forceReportsActive = key === "REPORTS" && location.pathname.startsWith("/reports/");
          const flyoutItems = flyoutLinksByKey[key] ?? [];
          return (
            <div key={key} className="relative w-full" onMouseEnter={() => setHoverKey(key)} onMouseLeave={() => setHoverKey((current) => (current === key ? null : current))}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `relative flex w-full flex-col items-center justify-center hover:bg-white/5 ${isActive || forceReportsActive ? "bg-white/10" : ""}`
                }
                style={{ height: spacing.sidebarItemHeight, padding: "10px 4px 9px" }}
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                      {key === "MAINT" && severeBadgeCount > 0 ? (
                        <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white">
                          {severeBadgeCount}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className="mt-1 text-[10px] leading-none uppercase"
                      style={{ color: "white", letterSpacing: "0.4px", fontWeight: isActive || forceReportsActive ? 600 : 400 }}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
              <SidebarFlyoutMenu
                open={hoverKey === key}
                title={label}
                items={flyoutItems}
                onOpen={() => setHoverKey(key)}
                onClose={() => setHoverKey((current) => (current === key ? null : current))}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
