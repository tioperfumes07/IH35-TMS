import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";

import { getArrivingSoon } from "../api/maintenance";
import { useCompanyContext } from "../contexts/CompanyContext";
import { spacing } from "../design/tokens";
import type { UserRole } from "../types/api";
import { resolveSidebarOrder, SIDEBAR_ITEM_META } from "./layout/sidebar-config";

type SidebarProps = {
  role: UserRole;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function Sidebar({ role, mobileOpen = false, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const { selectedCompanyId } = useCompanyContext();

  // Uniform sidebar order for every operator — single source of truth is SIDEBAR_DEFAULT_ORDER.
  // Order does not depend on per-user prefs or role (Jorge 2026-06-16). Item *visibility* is still
  // permission-gated below via `visibleRoles`.
  const order = useMemo(() => resolveSidebarOrder(), []);

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

  const visibleMetas = useMemo(
    () =>
      order
        .map((id) => SIDEBAR_ITEM_META[id])
        .filter((meta) => !meta.visibleRoles || meta.visibleRoles.includes(role)),
    [order, role]
  );

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onMouseDown={() => onMobileClose?.()}
        />
      ) : null}
      <aside
        className={`sidebar z-50 shrink-0 flex-col text-white md:z-auto md:flex max-lg:overflow-x-hidden ${
          mobileOpen ? "fixed inset-y-0 left-0 flex w-20 md:relative md:inset-auto" : "hidden md:flex"
        }`}
        style={{ background: "rgb(27, 35, 51)", borderRight: "1px solid rgb(42, 50, 66)" }}
      >
        <div className="flex h-full flex-col items-center gap-1 py-2">
          {visibleMetas.map((meta) => {
            const forceReportsActive = meta.id === "reports" && location.pathname.startsWith("/reports/");
            const forceAccountingActive = meta.id === "accounting" && location.pathname.startsWith("/accounting");
            const forceActive = forceReportsActive || forceAccountingActive;
            const showMaintBadge = meta.badgeKey === "maintenance_severe" && severeBadgeCount > 0;
            return (
              <div key={meta.id} className="w-full">
                <NavLink
                  to={meta.to}
                  data-tour={meta.dataTour}
                  onClick={() => onMobileClose?.()}
                  className={({ isActive }) =>
                    `relative flex w-full flex-col items-center justify-center hover:bg-white/5 ${isActive || forceActive ? "bg-white/10" : ""}`
                  }
                  style={{ height: spacing.sidebarItemHeight, padding: "10px 4px 9px" }}
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center justify-center">
                        <meta.Icon className="h-4 w-4" />
                        {showMaintBadge ? (
                          <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white">
                            {severeBadgeCount}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className="mt-1 text-[10px] leading-none uppercase"
                        style={{
                          color: "white",
                          letterSpacing: "0.4px",
                          fontWeight: isActive || forceActive ? 600 : 400,
                        }}
                      >
                        {meta.label}
                      </span>
                    </>
                  )}
                </NavLink>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
