import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { ByLaneView } from "./ByLaneView";
import { ByTypeView } from "./ByTypeView";
import { ByCustomerView } from "./ByCustomerView";
import { ByLoadView } from "./ByLoadView";
import { KpiStrip } from "./KpiStrip";
import { FilterBar } from "./FilterBar";

type Tab = "lane" | "type" | "customer" | "load";

export function ProfitabilityPage() {
  const [activeTab, setActiveTab] = useState<Tab>("lane");
  const [filters, setFilters] = useState({
    dateFrom: "2026-05-01",
    dateTo: "2026-06-01",
    equipmentType: undefined as string | undefined,
    customerId: undefined as string | undefined,
    laneKey: undefined as string | undefined,
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "lane", label: "By Lane" },
    { id: "type", label: "By Type" },
    { id: "customer", label: "By Customer" },
    { id: "load", label: "By Load" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Profitability" />
      
      <FilterBar filters={filters} onChange={(f) => setFilters({ ...filters, ...f })} />
      
      <KpiStrip filters={filters} />

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Profitability">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium",
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
