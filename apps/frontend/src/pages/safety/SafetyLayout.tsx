import { createContext, useContext, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SAFETY_GROUPS, findSafetyTab } from "../../components/safety/SAFETY_TABS_CONFIG";
import { SafetyDashboardFilter, type SafetyDriverFilter } from "../../components/safety/SafetyDashboardFilter";
import { SafetyGroupNav } from "../../components/safety/SafetyGroupNav";

type SafetyUiContextValue = {
  filter: SafetyDriverFilter;
  setFilter: (next: SafetyDriverFilter) => void;
  shownDrivers: number;
  totalDrivers: number;
  setDriverCounts: (shown: number, total: number) => void;
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
  const [filter, setFilter] = useState<SafetyDriverFilter>("active-7-10");
  const [shownDrivers, setShownDrivers] = useState(0);
  const [totalDrivers, setTotalDrivers] = useState(0);

  const activeTabId = useMemo(() => {
    const path = location.pathname;
    for (const group of SAFETY_GROUPS) {
      for (const tab of group.tabs) {
        if (tab.route === path) return tab.id;
      }
    }
    return "driver-files";
  }, [location.pathname]);

  const activeMeta = findSafetyTab(activeTabId);

  const contextValue = useMemo<SafetyUiContextValue>(
    () => ({
      filter,
      setFilter,
      shownDrivers,
      totalDrivers,
      setDriverCounts: (shown, total) => {
        setShownDrivers(shown);
        setTotalDrivers(total);
      },
    }),
    [filter, shownDrivers, totalDrivers]
  );

  return (
    <SafetyUiContext.Provider value={contextValue}>
      <div className="space-y-0">
        <div className="flex items-end justify-between border-b border-gray-200 bg-white px-[22px] py-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <button
                type="button"
                onClick={() => navigate("/home")}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
              <span>Modules</span>
              <span>&gt;</span>
              <Link to="/safety/driver-files" className="hover:text-slate-600">
                Safety
              </Link>
              <span>&gt;</span>
              <span>{activeMeta?.group.label ?? "Driver Files & Training"}</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Safety</h2>
          </div>
          <div className="text-xs text-slate-500">Compliance · inspections · discipline · liability · alerts</div>
        </div>

        <SafetyDashboardFilter value={filter} onChange={setFilter} shown={shownDrivers} total={totalDrivers} />
        <SafetyGroupNav
          groups={SAFETY_GROUPS}
          activeTabId={activeTabId}
          onTabChange={(tabId) => {
            const target = findSafetyTab(tabId)?.tab.route ?? "/safety/driver-files";
            navigate(target);
          }}
        />
        <div className="px-[22px] py-3">
          <Outlet />
        </div>
      </div>
    </SafetyUiContext.Provider>
  );
}
