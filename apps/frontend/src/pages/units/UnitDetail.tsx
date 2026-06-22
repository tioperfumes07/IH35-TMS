import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { UnitPermitsTab } from "./UnitPermitsTab";
import { UnitTollTagsTab } from "./UnitTollTagsTab";

type UnitDetailTab = "permits" | "toll-tags";

export function UnitDetail() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState<UnitDetailTab>("permits");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "toll-tags" || tab === "permits") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-3 p-4" data-testid="unit-detail-page">
      <PageHeader title={`Unit ${id.slice(0, 8)}`} subtitle="Permits and toll tags" />
      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}
      <div className="flex flex-wrap gap-1 rounded border border-gray-200 bg-white p-1">
        {(["permits", "toll-tags"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded px-2.5 py-1.5 text-xs font-medium capitalize ${
              activeTab === tab ? "bg-slate-100 text-slate-700" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab === "toll-tags" ? "Toll Tags" : "Permits"}
          </button>
        ))}
      </div>
      {activeTab === "permits" ? <UnitPermitsTab unitId={id} companyId={companyId} /> : null}
      {activeTab === "toll-tags" ? <UnitTollTagsTab unitId={id} companyId={companyId} /> : null}
    </div>
  );
}
