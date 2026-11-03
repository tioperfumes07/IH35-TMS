import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { ByLaneView } from "./ByLaneView";
import { ByTypeView } from "./ByTypeView";
import { ByCustomerView } from "./ByCustomerView";
import { ByLoadView } from "./ByLoadView";
import { KpiStrip } from "./KpiStrip";
import { FilterBar } from "./FilterBar";

type Tab = "lane" | "type" | "customer" | "load";

const TABS: { id: Tab; label: string }[] = [
  { id: "lane", label: "By Lane" },
  { id: "type", label: "By Type" },
  { id: "customer", label: "By Customer" },
  { id: "load", label: "By Load" },
];
const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

export function parseProfitabilityTab(raw: string | null): Tab {
  if (raw && TAB_IDS.has(raw)) return raw as Tab;
  return "lane";
}

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(start), dateTo: iso(end) };
}

export function ProfitabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseProfitabilityTab(searchParams.get("tab"));
  const setActiveTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "lane") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const initial = useMemo(() => defaultPeriod(), []);
  const [filters, setFilters] = useState({
    dateFrom: initial.dateFrom,
    dateTo: initial.dateTo,
    equipmentType: undefined as string | undefined,
    customerId: undefined as string | undefined,
    laneKey: undefined as string | undefined,
  });

  return (
    <div className="space-y-4" data-testid="profitability-page">
      <PageHeader title="Profitability" />

      <FilterBar
        filters={filters}
        onChange={(f) => setFilters({ ...filters, ...f })}
        exportDisabledReason="Open a tab below, then use the full report Export on Lane / Customer / Trip P&L"
      />

      <KpiStrip filters={filters} />

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Profitability">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium",
                  isActive
                    ? "border-green-600 text-green-700"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-4">
        {activeTab === "lane" && <ByLaneView filters={filters} />}
        {activeTab === "type" && <ByTypeView filters={filters} />}
        {activeTab === "customer" && <ByCustomerView filters={filters} />}
        {activeTab === "load" && <ByLoadView filters={filters} />}
      </div>
    </div>
  );
}
