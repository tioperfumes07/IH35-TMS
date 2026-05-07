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
  SquareStack,
  Truck,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { getArrivingSoon } from "../api/maintenance";
import { useCompanyContext } from "../contexts/CompanyContext";
import { colors, spacing } from "../design/tokens";
import type { UserRole } from "../types/api";

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
  { key: "ACCTG", label: "ACCTG", Icon: Calculator, to: "/accounting" },
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
  { key: "425C", label: "425C", Icon: SquareStack, to: "/425c" },
  { key: "DRV_APP", label: "DRV APP", Icon: Activity, to: "/driver-app" },
];

type SidebarProps = {
  role: UserRole;
};

export function Sidebar({ role }: SidebarProps) {
  const { selectedCompanyId } = useCompanyContext();
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

  return (
    <aside
      className="shrink-0 text-white"
      style={{ width: spacing.sidebarWidth, backgroundColor: colors.sidebarBg, borderRight: `1px solid ${colors.sidebarBorder}` }}
    >
      <div className="flex h-full flex-col items-center gap-1 py-2">
        {visibleItems.map(({ key, label, Icon, to }) => {
          return (
            <NavLink
              key={key}
              to={to}
              className={({ isActive }) =>
                `relative flex w-full flex-col items-center justify-center px-1 py-1 hover:bg-white/5 ${isActive ? "bg-white/10" : ""}`
              }
              style={{ height: spacing.sidebarItemHeight }}
            >
              {({ isActive }) => (
                <>
                  {isActive ? <span className="absolute left-0 top-0 h-full" style={{ width: 3, backgroundColor: colors.sidebarActiveBorder }} /> : null}
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
                    style={{ color: isActive ? colors.sidebarTextActive : colors.sidebarTextMuted, letterSpacing: "0.4px" }}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}
