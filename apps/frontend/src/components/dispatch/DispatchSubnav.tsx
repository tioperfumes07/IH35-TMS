import { AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { listFactoringCandidateInvoices } from "../../api/accounting";
import {
  getDetentionBoard,
  getDispatchDashboard,
  getOcrIntakeQueue,
  getPodDocuments,
  listAtRiskOrLateDispatchLoads,
  listDispatchAssignmentHistory,
  listLateArrivalDispatchLoads,
  listLoadTemplates,
  listUnitsWithoutLoad,
} from "../../api/dispatch";
import { listLatestPositions } from "../../api/telematics";
import "../../components/forms/shared/HoverDropdownNav.css";

type NavChild = { label: string; href: string; badgeKey?: string };
type NavItem = {
  label: string;
  href?: string;
  badgeKey?: string;
  children?: readonly NavChild[];
};

const DISPATCH_NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Load board",
    href: "/dispatch?view=kanban",
    badgeKey: "load_board",
  },
  {
    label: "Assignments",
    href: "/dispatch/assignment-history",
    badgeKey: "assignments",
  },
  { label: "At-Risk", href: "/dispatch/at-risk", badgeKey: "at_risk" },
  { label: "Detention", href: "/dispatch/detention", badgeKey: "detention" },
  { label: "Border", href: "/dispatch/border-crossing" },
  { label: "Late", href: "/dispatch/alerts/late-arrivals", badgeKey: "late" },
  { label: "Live Map", href: "/dispatch/geofencing", badgeKey: "live_map" },
  { label: "Trip Pairing", href: "/dispatch/trip-pairing" },
  { label: "Factoring", href: "/accounting/factoring", badgeKey: "factoring" },
  {
    label: "Planning",
    href: "/dispatch/planners/loads",
    children: [
      { label: "Driver Planner", href: "/dispatch/planners/driver" },
      { label: "Truck Planner", href: "/dispatch/planners/truck" },
      { label: "Loads Planner", href: "/dispatch/planners/loads" },
      { label: "Planner Calendar", href: "/dispatch/planner" },
      {
        label: "Load Templates",
        href: "/dispatch/planner?panel=templates",
        badgeKey: "load_templates",
      },
      {
        label: "Unassigned Units",
        href: "/dispatch?view=overview&panel=unassigned",
        badgeKey: "unassigned_units",
      },
      { label: "Reserve a Load", href: "/dispatch/book-load?book_load=1" },
    ],
  },
  {
    label: "Settlements",
    children: [
      { label: "Settlements", href: "/driver-finance/settlements" },
      { label: "Pre-settlements", href: "/accounting/pre-settlements" },
    ],
  },
  {
    label: "Documents",
    children: [
      {
        label: "POD Review",
        href: "/dispatch/pod-review",
        badgeKey: "pod_review",
      },
      {
        label: "OCR Queue",
        href: "/dispatch/ocr-queue",
        badgeKey: "ocr_queue",
      },
      { label: "Equipment transfers", href: "/dispatch/equipment-transfers" },
    ],
  },
] as const;

function countDispatchNavDestinations(items: readonly NavItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.href) total += 1;
    if (item.children) total += item.children.length;
  }
  return total;
}

/** HOME quick-jump badge — every dispatch queue / planner / document destination. */
export const DISPATCH_HOME_QUICK_JUMP_COUNT =
  countDispatchNavDestinations(DISPATCH_NAV_ITEMS);

const BREADCRUMB_LABELS: Record<string, string> = {
  "/dispatch": "Overview",
  "/dispatch?view=overview": "Overview",
  "/dispatch?view=kanban": "Load board",
  "/dispatch?view=list": "Load board",
  "/dispatch/loads": "Load board",
  "/dispatch/assignment-history": "Assignments",
  "/dispatch/at-risk": "At-Risk",
  "/dispatch/detention": "Detention",
  "/dispatch/border-crossing": "Border",
  "/dispatch/border-crossing/history": "Border",
  "/dispatch/alerts/late-arrivals": "Late",
  "/dispatch/geofencing": "Live Map",
  "/accounting/factoring": "Factoring",
  "/dispatch/planners/driver": "Driver Planner",
  "/dispatch/planners/truck": "Truck Planner",
  "/dispatch/planners/loads": "Loads Planner",
  "/dispatch/planner": "Planner Calendar",
  "/dispatch/planner?panel=templates": "Load Templates",
  "/dispatch?view=overview&panel=unassigned": "Unassigned Units",
  "/dispatch?book_load=1": "Reserve a Load",
  "/dispatch/book-load": "Reserve a Load",
  "/dispatch/book-load?book_load=1": "Reserve a Load",
  "/driver-finance/settlements": "Settlements",
  "/accounting/pre-settlements": "Pre-settlements",
  "/dispatch/pod-review": "POD Review",
  "/dispatch/ocr-queue": "OCR Queue",
  "/dispatch/equipment-transfers": "Equipment transfers",
};

function itemOrChildActive(item: NavItem, activeHref?: string): boolean {
  if (!activeHref) return false;
  if (item.href != null && item.href === activeHref) return true;
  return item.children?.some((c) => c.href === activeHref) ?? false;
}

/** Map pathname + search to the active queue tab href. */
export function dispatchSubNavActiveHref(
  pathname: string,
  search: string,
): string {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  const panel = params.get("panel");
  const bookLoad = params.get("book_load");

  if (pathname === "/dispatch/book-load" || bookLoad === "1") {
    return bookLoad === "1"
      ? "/dispatch/book-load?book_load=1"
      : "/dispatch/book-load";
  }
  if (pathname === "/dispatch" || pathname === "/dispatch/loads") {
    if (view === "overview" && panel === "unassigned")
      return "/dispatch?view=overview&panel=unassigned";
    if (view === "overview") return "/dispatch?view=overview";
    if (pathname === "/dispatch/loads" || view === "list")
      return "/dispatch?view=list";
    return "/dispatch?view=kanban";
  }
  if (pathname.startsWith("/dispatch/planners/truck"))
    return "/dispatch/planners/truck";
  if (pathname.startsWith("/dispatch/planners/loads"))
    return "/dispatch/planners/loads";
  if (pathname.startsWith("/dispatch/planners"))
    return "/dispatch/planners/driver";
  if (pathname === "/dispatch/planner") {
    return panel === "templates"
      ? "/dispatch/planner?panel=templates"
      : "/dispatch/planner";
  }
  if (pathname.startsWith("/dispatch/assignment-history"))
    return "/dispatch/assignment-history";
  if (pathname.startsWith("/dispatch/at-risk")) return "/dispatch/at-risk";
  if (pathname.startsWith("/dispatch/detention")) return "/dispatch/detention";
  if (pathname.startsWith("/dispatch/border-crossing"))
    return "/dispatch/border-crossing";
  if (pathname.startsWith("/dispatch/alerts/late-arrivals"))
    return "/dispatch/alerts/late-arrivals";
  if (pathname.startsWith("/dispatch/geofencing"))
    return "/dispatch/geofencing";
  if (pathname.startsWith("/accounting/factoring"))
    return "/accounting/factoring";
  if (pathname.startsWith("/driver-finance/settlements"))
    return "/driver-finance/settlements";
  if (pathname.startsWith("/accounting/pre-settlements"))
    return "/accounting/pre-settlements";
  if (pathname.startsWith("/dispatch/pod-review"))
    return "/dispatch/pod-review";
  if (pathname.startsWith("/dispatch/ocr-queue")) return "/dispatch/ocr-queue";
  return pathname;
}

export function dispatchBreadcrumbLabel(
  pathname: string,
  search: string,
): string {
  const activeHref = dispatchSubNavActiveHref(pathname, search);
  return (
    BREADCRUMB_LABELS[activeHref] ?? BREADCRUMB_LABELS[pathname] ?? "Dispatch"
  );
}

function CountBadge({ count }: { count: number | null | undefined }) {
  if (count == null) return null;
  const hot = count > 0;
  return (
    <span
      className={`ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded px-1 text-[10px] font-semibold leading-none ${
        hot ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
      }`}
      aria-label={`${count} items`}
    >
      {count}
    </span>
  );
}

function DropdownColumn({
  item,
  activeHref,
  badges,
}: {
  item: NavItem;
  activeHref?: string;
  badges: Record<string, number | null | undefined>;
}) {
  const menuId = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const openViaKey = useRef(false);

  const clearHide = useCallback(() => {
    if (hideTimer.current != null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHide();
    setOpen(true);
  }, [clearHide]);

  useEffect(() => {
    if (!open) return undefined;
    if (openViaKey.current) {
      queueMicrotask(() => {
        menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
        openViaKey.current = false;
      });
    }

    const onDocMouse = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };

    const onDocKey = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [open]);

  useEffect(() => () => clearHide(), [clearHide]);

  const parentActive = itemOrChildActive(item, activeHref);
  const groupBadgeTotal = (item.children ?? []).reduce((sum, child) => {
    if (!child.badgeKey) return sum;
    const n = badges[child.badgeKey];
    return sum + (typeof n === "number" ? n : 0);
  }, 0);

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openViaKey.current = true;
        show();
      } else {
        queueMicrotask(() =>
          menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus(),
        );
      }
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) show();
      else
        queueMicrotask(() =>
          menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus(),
        );
    }
  };

  return (
    <li role="none" className="nav-item-with-dropdown">
      {/* Click-to-toggle persistent menu (overrides locked-decision #728 hover pattern per Jorge).
          Opens on click, STAYS open until an item is chosen, an outside click, or Escape. */}
      <div className="nav-split">
        {item.href ? (
          // C-1 split control: the LABEL navigates to the default planner; the CHEVRON keeps the
          // click-to-toggle persistent submenu (locked decision #728 preserved — see test).
          <Link
            role="menuitem"
            to={item.href}
            className={parentActive ? "active" : undefined}
          >
            {item.label}
            {groupBadgeTotal > 0 ? (
              <CountBadge count={groupBadgeTotal} />
            ) : null}
          </Link>
        ) : null}
        <button
          ref={btnRef}
          type="button"
          role={item.href ? undefined : "menuitem"}
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={item.href ? `${item.label} submenu` : undefined}
          className={!item.href && parentActive ? "active" : undefined}
          id={`${menuId}-trigger`}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={onButtonKeyDown}
        >
          {item.href ? null : (
            <>
              {item.label}
              {groupBadgeTotal > 0 ? (
                <CountBadge count={groupBadgeTotal} />
              ) : null}
            </>
          )}
          <ChevronDown size={12} aria-hidden />
        </button>
        {open ? (
          <ul
            ref={menuRef}
            id={menuId}
            role="menu"
            className="nav-dropdown"
            tabIndex={-1}
          >
            {(item.children ?? []).map((child) => (
              <li key={child.href} role="none">
                <Link
                  role="menuitem"
                  to={child.href}
                  className={activeHref === child.href ? "active" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {child.label}
                  {child.badgeKey ? (
                    <CountBadge count={badges[child.badgeKey]} />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function LeafItem({
  item,
  activeHref,
  badges,
}: {
  item: NavItem;
  activeHref?: string;
  badges: Record<string, number | null | undefined>;
}) {
  if (item.href == null) return null;
  const active = activeHref === item.href;
  return (
    <li role="none">
      <Link
        role="menuitem"
        to={item.href}
        className={active ? "active" : undefined}
      >
        {item.label}
        {item.badgeKey ? <CountBadge count={badges[item.badgeKey]} /> : null}
      </Link>
    </li>
  );
}

type Props = {
  operatingCompanyId: string;
};

export function DispatchSubnav({ operatingCompanyId }: Props) {
  const { pathname, search } = useLocation();
  const activeHref = dispatchSubNavActiveHref(pathname, search);
  const breadcrumbView = dispatchBreadcrumbLabel(pathname, search);
  const enabled = Boolean(operatingCompanyId);

  const [
    dashboardQ,
    assignmentsQ,
    atRiskQ,
    detentionQ,
    lateQ,
    positionsQ,
    factoringQ,
    unassignedQ,
    templatesQ,
    podQ,
    ocrQ,
  ] = useQueries({
    queries: [
      {
        queryKey: ["dispatch-subnav", "dashboard", operatingCompanyId],
        queryFn: () => getDispatchDashboard(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "assignments", operatingCompanyId],
        queryFn: () => listDispatchAssignmentHistory(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "at-risk", operatingCompanyId],
        queryFn: () => listAtRiskOrLateDispatchLoads(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "detention", operatingCompanyId],
        queryFn: () => getDetentionBoard(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "late", operatingCompanyId],
        queryFn: () => listLateArrivalDispatchLoads(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "positions", operatingCompanyId],
        queryFn: () => listLatestPositions(operatingCompanyId),
        enabled,
        refetchInterval: 30_000,
      },
      {
        queryKey: ["dispatch-subnav", "factoring", operatingCompanyId],
        queryFn: () => listFactoringCandidateInvoices(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "unassigned", operatingCompanyId],
        queryFn: () => listUnitsWithoutLoad(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "templates", operatingCompanyId],
        queryFn: () => listLoadTemplates(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "pod", operatingCompanyId],
        queryFn: () =>
          getPodDocuments(operatingCompanyId, { status: "pending_review" }),
        enabled,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["dispatch-subnav", "ocr", operatingCompanyId],
        queryFn: () => getOcrIntakeQueue(operatingCompanyId),
        enabled,
        refetchInterval: 60_000,
      },
    ],
  });

  const failedBadgeQueries = [
    dashboardQ,
    assignmentsQ,
    atRiskQ,
    detentionQ,
    lateQ,
    positionsQ,
    factoringQ,
    unassignedQ,
    templatesQ,
    podQ,
    ocrQ,
  ].filter((query) => query.isError);

  const badges = useMemo<Record<string, number | null | undefined>>(
    () => ({
      load_board:
        enabled && !dashboardQ.isLoading && !dashboardQ.isError
          ? Number(dashboardQ.data?.active_loads ?? 0)
          : null,
      assignments:
        enabled && !assignmentsQ.isLoading && !assignmentsQ.isError
          ? (assignmentsQ.data?.rows?.length ?? 0)
          : null,
      at_risk:
        enabled && !atRiskQ.isLoading && !atRiskQ.isError
          ? (atRiskQ.data?.count ?? 0)
          : null,
      detention:
        enabled && !detentionQ.isLoading && !detentionQ.isError
          ? Number(detentionQ.data?.active_count ?? detentionQ.data?.count ?? 0)
          : null,
      late:
        enabled && !lateQ.isLoading && !lateQ.isError
          ? Number(lateQ.data?.count ?? lateQ.data?.loads?.length ?? 0)
          : null,
      live_map:
        enabled && !positionsQ.isLoading && !positionsQ.isError
          ? (positionsQ.data?.rows?.length ?? 0)
          : null,
      factoring:
        enabled && !factoringQ.isLoading && !factoringQ.isError
          ? (factoringQ.data?.rows?.length ?? 0)
          : null,
      unassigned_units:
        enabled && !unassignedQ.isLoading && !unassignedQ.isError
          ? (unassignedQ.data?.units?.length ?? 0)
          : null,
      load_templates:
        enabled && !templatesQ.isLoading && !templatesQ.isError
          ? (templatesQ.data?.templates?.length ?? 0)
          : null,
      pod_review:
        enabled && !podQ.isLoading && !podQ.isError
          ? Number(podQ.data?.count ?? podQ.data?.documents?.length ?? 0)
          : null,
      ocr_queue:
        enabled && !ocrQ.isLoading && !ocrQ.isError
          ? (ocrQ.data?.items?.length ?? 0)
          : null,
    }),
    [
      enabled,
      dashboardQ.isLoading,
      dashboardQ.isError,
      dashboardQ.data,
      assignmentsQ.isLoading,
      assignmentsQ.isError,
      assignmentsQ.data,
      atRiskQ.isLoading,
      atRiskQ.isError,
      atRiskQ.data,
      detentionQ.isLoading,
      detentionQ.isError,
      detentionQ.data,
      lateQ.isLoading,
      lateQ.isError,
      lateQ.data,
      positionsQ.isLoading,
      positionsQ.isError,
      positionsQ.data,
      factoringQ.isLoading,
      factoringQ.isError,
      factoringQ.data,
      unassignedQ.isLoading,
      unassignedQ.isError,
      unassignedQ.data,
      templatesQ.isLoading,
      templatesQ.isError,
      templatesQ.data,
      podQ.isLoading,
      podQ.isError,
      podQ.data,
      ocrQ.isLoading,
      ocrQ.isError,
      ocrQ.data,
    ],
  );

  return (
    <div className="space-y-1" data-testid="dispatch-queues-subnav">
      {failedBadgeQueries.length > 0 ? (
        <div
          role="alert"
          data-testid="dispatch-subnav-badge-error"
          className="mx-2 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
            Some queue counts are unavailable.
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            onClick={() => {
              for (const query of failedBadgeQueries) void query.refetch();
            }}
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : null}
      <nav
        className="hover-dropdown-nav"
        aria-label="Dispatch queue navigation (hover dropdown)"
      >
        <ul role="menubar">
          {DISPATCH_NAV_ITEMS.map((item) =>
            item.children?.length ? (
              <DropdownColumn
                key={item.label}
                item={item}
                activeHref={activeHref}
                badges={badges}
              />
            ) : (
              <LeafItem
                key={item.label}
                item={item}
                activeHref={activeHref}
                badges={badges}
              />
            ),
          )}
        </ul>
      </nav>
      <nav
        aria-label="Breadcrumb"
        className="px-2 text-xs text-[#6B7280]"
        data-testid="dispatch-breadcrumb"
      >
        <Link to="/dispatch" className="text-[#1F2A44] hover:underline">
          Dispatch
        </Link>
        <span className="mx-1.5 text-[#6B7280]">›</span>
        <span className="font-semibold text-[#0F1219]">{breadcrumbView}</span>
      </nav>
    </div>
  );
}
