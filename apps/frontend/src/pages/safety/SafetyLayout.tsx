import { createContext, useContext, useMemo, useState } from "react";
import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getLatestCsa, getSafetyKpis, getUserPreferences, patchUserPreferences } from "../../api/safety";
import { AnomalyAlertBadge } from "../../components/safety/AnomalyAlertBadge";
import { SAFETY_GROUPS, findSafetyTab, findSafetyTabByPath } from "../../components/safety/SAFETY_TABS_CONFIG";
import {
  SafetyDashboardFilter,
  type SafetyActivityWindow,
  type SafetyDriverFilter,
} from "../../components/safety/SafetyDashboardFilter";
import { SafetyGroupNav } from "../../components/safety/SafetyGroupNav";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CSAScoreCard } from "./components/CSAScoreCard";
import { SafetyKpiRow } from "./components/SafetyKpiRow";
import { userFacingApiError } from "../../lib/api-error-message";
import { hasInAppHistory } from "../../lib/smart-back";

type SafetyUiContextValue = {
  filter: SafetyDriverFilter;
  setFilter: (next: SafetyDriverFilter) => void;
  activityWindow: SafetyActivityWindow;
  setActivityWindow: (next: SafetyActivityWindow) => void;
  shownDrivers: number;
  totalDrivers: number;
  setDriverCounts: (shown: number, total: number) => void;
  // SM3: whether the active tab has actually reported counts. The counter line renders only when true,
  // so tabs that do not feed the bar no longer show a permanent (lying) "0 active · 0 resolved · 0 total".
  countsReported: boolean;
  clearDriverCounts: () => void;
  // S-04: shared From/To date-range, additive alongside the existing activity-window toggle. "" = unset.
  fromDate: string;
  toDate: string;
  setFromDate: (next: string) => void;
  setToDate: (next: string) => void;
};

const SafetyUiContext = createContext<SafetyUiContextValue | null>(null);

export function useSafetyUiContext() {
  const value = useContext(SafetyUiContext);
  if (!value) {
    throw new Error("useSafetyUiContext must be used within SafetyLayout");
  }
  return value;
}

export function SafetyLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [filter, setFilter] = useState<SafetyDriverFilter>("active");
  const [activityWindow, setActivityWindow] = useState<SafetyActivityWindow>("7d");
  const [shownDrivers, setShownDrivers] = useState(0);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [countsReported, setCountsReported] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const prefsQuery = useQuery({
    queryKey: ["user", "preferences"],
    queryFn: getUserPreferences,
  });
  const prefsMutation = useMutation({
    mutationFn: (preferences: Record<string, unknown>) => patchUserPreferences(preferences),
    // Both controls PATCH the complete Safety preference object. TanStack serializes mutations
    // sharing a scope, so an older Active/All write cannot finish after and overwrite a newer
    // activity-window choice (or vice versa).
    scope: { id: "safety-filter-preferences" },
  });
  // Cross-module KPI strip + cached CSA badge — shown on every Safety tab (Law of Total
  // Connectivity: a persistent view of company-wide safety health regardless of which tab is active).
  const kpisQuery = useQuery({
    queryKey: ["safety", "kpis", companyId],
    queryFn: () => getSafetyKpis(companyId),
    enabled: Boolean(companyId),
  });
  const csaQuery = useQuery({
    queryKey: ["safety", "csa", "latest", companyId],
    queryFn: () => getLatestCsa(companyId),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    const prefs = prefsQuery.data?.preferences as {
      safety?: { active_only?: boolean; activity_window?: SafetyActivityWindow };
    } | undefined;
    if (!prefs?.safety) return;
    setFilter(prefs.safety.active_only === false ? "all" : "active");
    if (prefs.safety.activity_window) setActivityWindow(prefs.safety.activity_window);
  }, [prefsQuery.data]);

  const activeTabId = useMemo(() => {
    const path = location.pathname;
    // S-13: the Safety home dashboard (S-11) is not one of the 28 canonical group tabs, so it must be
    // detected explicitly — otherwise it fell through to the "driver-files" fallback below and the
    // breadcrumb/nav highlighted "Driver Files & Training" while the page showed something else.
    if (path === "/safety/home" || path === "/safety") return "home";
    // INS-CLAIMS-ROUTE (Cascade USMCA wire 2026-08-09): exact `tab.route === path` missed nested
    // Insurance mounts (`/safety/insurance/claims`, `/policies/:id`, …) so the chrome lied as
    // "Driver Files & Training" while Outlet correctly showed Claims. Match longest prefix first
    // with `route` or `route/` boundary (never `/safety/hos` swallowing `/safety/hos-violations`).
    return findSafetyTabByPath(path)?.tab.id ?? "driver-files";
  }, [location.pathname]);

  const activeMeta = activeTabId === "home" ? null : findSafetyTab(activeTabId);

  const contextValue = useMemo<SafetyUiContextValue>(
    () => ({
      filter,
      setFilter: (next) => {
        setFilter(next);
        void prefsMutation.mutateAsync({
          safety: { active_only: next === "active", activity_window: activityWindow },
        });
      },
      activityWindow,
      setActivityWindow: (next) => {
        setActivityWindow(next);
        void prefsMutation.mutateAsync({
          safety: { active_only: filter === "active", activity_window: next },
        });
      },
      shownDrivers,
      totalDrivers,
      setDriverCounts: (shown, total) => {
        setShownDrivers(shown);
        setTotalDrivers(total);
        setCountsReported(true);
      },
      countsReported,
      clearDriverCounts: () => {
        setCountsReported(false);
        setShownDrivers(0);
        setTotalDrivers(0);
      },
      fromDate,
      toDate,
      setFromDate,
      setToDate,
    }),
    [filter, activityWindow, shownDrivers, totalDrivers, countsReported, fromDate, toDate]
  );

  return (
    <SafetyUiContext.Provider value={contextValue}>
      <div className="space-y-0">
        <div className="flex items-end justify-between border-b border-gray-200 bg-white px-[22px] py-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <button
                type="button"
                aria-label="Back"
                onClick={() => {
                  if (hasInAppHistory(window.history.state)) {
                    navigate(-1);
                    return;
                  }
                  navigate("/home");
                }}
                className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
              <span>Modules</span>
              <span>&gt;</span>
              <Link to="/safety/home" className="hover:text-slate-600">
                Safety
              </Link>
              {activeTabId === "home" ? null : (
                <>
                  <span>&gt;</span>
                  <span>{activeMeta?.group.label ?? "Driver Files & Training"}</span>
                </>
              )}
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Safety</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-500">Compliance · inspections · discipline · liability · alerts</div>
            <AnomalyAlertBadge operatingCompanyId={companyId} />
          </div>
        </div>

        {prefsMutation.isError ? (
          <p className="border-b border-red-200 bg-red-50 px-[22px] py-2 text-xs text-red-700" data-testid="safety-prefs-error">
            {userFacingApiError(prefsMutation.error, "Could not save Safety filter preferences.")}
          </p>
        ) : null}
        {prefsQuery.isError ? (
          <p className="border-b border-red-200 bg-red-50 px-[22px] py-2 text-xs text-red-700" data-testid="safety-prefs-query-error">
            {userFacingApiError(prefsQuery.error, "Could not load Safety filter preferences.")}
          </p>
        ) : null}

        <SafetyDashboardFilter
          value={filter}
          onChange={contextValue.setFilter}
          activityWindow={activityWindow}
          onActivityWindowChange={contextValue.setActivityWindow}
          shown={shownDrivers}
          total={totalDrivers}
          countsReported={contextValue.countsReported}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
        />
        <div className="space-y-2 px-[22px] py-2">
          {kpisQuery.isError || csaQuery.isError ? (
            <p className="text-xs text-red-700" data-testid="safety-layout-query-error">
              {userFacingApiError(
                kpisQuery.error ?? csaQuery.error,
                "Could not load Safety KPI / CSA strip.",
              )}
            </p>
          ) : null}
          <div className="grid gap-2 lg:grid-cols-[1fr_260px]">
            {kpisQuery.isError ? (
              <p className="rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="safety-kpis-query-error">
                {userFacingApiError(kpisQuery.error, "Could not load Safety KPIs.")}
              </p>
            ) : (
              <SafetyKpiRow kpis={kpisQuery.data} />
            )}
            {csaQuery.isError ? (
              <p className="rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="safety-csa-query-error">
                {userFacingApiError(csaQuery.error, "Could not load latest CSA rollup.")}
              </p>
            ) : (
              <CSAScoreCard latest={csaQuery.data?.latest} />
            )}
          </div>
        </div>

        {/* SAFETY-STUCK-RENDER-ON-DUAL-NAVIGATE: onTabChange used to call navigate(target) here on
            EVERY click, racing against the NavLink's own built-in navigation to the identical
            `to={tab.route}` destination (SafetyGroupNav.tsx). Two synchronous navigate() calls to
            the same target in one click handler could leave the URL updated but the routed
            <Outlet/> child un-swapped — reproduced live: clicking a group-nav item while on a
            client-state driver-detail view (DriverFilesTab's internal `driverId`) left that view
            stuck on screen under the new URL until a hard reload. NavLink's `to` prop is already
            the single source of truth for this navigation; no second imperative navigate() call. */}
        <SafetyGroupNav groups={SAFETY_GROUPS} activeTabId={activeTabId} />
        <div className="px-[22px] py-3">
          <Outlet />
        </div>
      </div>
    </SafetyUiContext.Provider>
  );
}
