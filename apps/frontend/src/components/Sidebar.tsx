import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
import { getArrivingSoon } from "../api/maintenance";
import { getUserPreferences, patchUserPreferences } from "../api/safety";
import { useCompanyContext } from "../contexts/CompanyContext";
import { spacing } from "../design/tokens";
import type { UserRole } from "../types/api";
import {
  getSidebarFlyoutItems,
  resolveSidebarOrder,
  SIDEBAR_ITEM_META,
  type SidebarItemId,
} from "./layout/sidebar-config";
import { SidebarFlyoutMenu } from "./SidebarFlyoutMenu";

type SidebarProps = {
  role: UserRole;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function Sidebar({ role, mobileOpen = false, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const [hoverId, setHoverId] = useState<SidebarItemId | null>(null);

  const prefsQuery = useQuery({
    queryKey: ["user", "preferences"],
    queryFn: getUserPreferences,
    staleTime: 60_000,
  });

  const resetOrderMutation = useMutation({
    mutationFn: () => patchUserPreferences({ sidebar_order: null }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["user", "preferences"] }),
  });

  const prefsRecord = prefsQuery.data?.preferences as Record<string, unknown> | undefined;
  const hasSidebarOverride = Array.isArray(prefsRecord?.sidebar_order);

  const order = useMemo(() => resolveSidebarOrder(role, prefsRecord), [role, prefsRecord]);

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
        className={`sidebar z-50 shrink-0 flex-col text-white md:z-auto md:flex ${
          mobileOpen ? "fixed inset-y-0 left-0 flex w-20 md:relative md:inset-auto" : "hidden md:flex"
        }`}
        style={{ background: "rgb(27, 35, 51)", borderRight: "1px solid rgb(42, 50, 66)" }}
      >
        <div className="flex h-full flex-col items-center gap-1 py-2">
          {visibleMetas.map((meta) => {
            const forceReportsActive = meta.id === "reports" && location.pathname.startsWith("/reports/");
            const flyoutItems = getSidebarFlyoutItems(meta.id, role);
            const showMaintBadge = meta.badgeKey === "maintenance_severe" && severeBadgeCount > 0;
            return (
              <div
                key={meta.id}
                className="relative w-full"
                onMouseEnter={() => setHoverId(meta.id)}
                onMouseLeave={() => setHoverId((current) => (current === meta.id ? null : current))}
              >
                <NavLink
                  to={meta.to}
                  data-tour={meta.dataTour}
                  onClick={() => onMobileClose?.()}
                  className={({ isActive }) =>
                    `relative flex w-full flex-col items-center justify-center hover:bg-white/5 ${isActive || forceReportsActive ? "bg-white/10" : ""}`
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
                          fontWeight: isActive || forceReportsActive ? 600 : 400,
                        }}
                      >
                        {meta.label}
                      </span>
                    </>
                  )}
                </NavLink>
                <SidebarFlyoutMenu
                  open={hoverId === meta.id}
                  title={meta.label}
                  items={flyoutItems}
                  onOpen={() => setHoverId(meta.id)}
                  onClose={() => setHoverId((current) => (current === meta.id ? null : current))}
                />
              </div>
            );
          })}
          {hasSidebarOverride ? (
            <button
              type="button"
              className="mt-1 px-1 text-center text-[9px] font-medium uppercase leading-tight text-white/70 underline decoration-white/30 hover:text-white"
              disabled={resetOrderMutation.isPending}
              onClick={() => void resetOrderMutation.mutateAsync()}
            >
              Reset nav order
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}
