import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { entityLabel } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { UnitPermitsTab } from "./UnitPermitsTab";
import { UnitTollTagsTab } from "./UnitTollTagsTab";
import { UnitFinanceLinkageTab } from "./UnitFinanceLinkageTab";
import { TasksTab } from "../../components/tasks/TasksTab";
import { UnitBrakesTab } from "../maintenance/units/UnitBrakesTab";
import { UnitTiresTab } from "../maintenance/units/UnitTiresTab";
import { UnitMaintenanceInspectionsReverseSection } from "../../components/maintenance/UnitMaintenanceInspectionsReverseSection";
import { UnitInTransitIssuesReverseSection } from "../../components/dispatch/UnitInTransitIssuesReverseSection";
import { UnitDefaultDriversReverseSection } from "../../components/fleet/UnitDefaultDriversReverseSection";
import { UnitTireProgramReverseSection } from "../../components/maintenance/UnitTireProgramReverseSection";
import { UnitSevereRepairsReverseSection } from "../../components/maintenance/UnitSevereRepairsReverseSection";

type UnitDetailTab = "permits" | "toll-tags" | "tasks" | "brakes" | "tires" | "finance";

export function UnitDetail() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState<UnitDetailTab>("permits");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "toll-tags" ||
      tab === "permits" ||
      tab === "tasks" ||
      tab === "brakes" ||
      tab === "tires" ||
      tab === "finance"
    ) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-3 p-4" data-testid="unit-detail-page">
      <PageHeader
        backHref="/units"
        breadcrumb={["Fleet", "Units", entityLabel(null, id, "Unit")]}
        title={entityLabel(null, id, "Unit")}
        subtitle="Permits, toll tags, and finance linkage"
      />
      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}
      {companyId ? <UnitMaintenanceInspectionsReverseSection operatingCompanyId={companyId} unitId={id} data-testid="unit-detail-maintenance-inspections" /> : null}
      {companyId ? <UnitInTransitIssuesReverseSection operatingCompanyId={companyId} unitId={id} /> : null}
      {companyId ? <UnitDefaultDriversReverseSection operatingCompanyId={companyId} unitId={id} /> : null}
      {companyId ? <UnitTireProgramReverseSection operatingCompanyId={companyId} unitId={id} /> : null}
      {companyId ? <UnitSevereRepairsReverseSection operatingCompanyId={companyId} unitId={id} /> : null}
      <div className="flex flex-wrap gap-1 rounded-sm border border-gray-200 bg-white p-1">
        {(["permits", "toll-tags", "tasks", "brakes", "tires", "finance"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded px-2.5 py-1.5 text-xs font-medium capitalize ${
              activeTab === tab ? "bg-slate-100 text-slate-700" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab === "toll-tags"
              ? "Toll Tags"
              : tab === "tasks"
                ? "Tasks"
                : tab === "brakes"
                  ? "Brakes"
                  : tab === "tires"
                    ? "Tires"
                    : tab === "finance"
                      ? "Loan / Lease / Depr."
                      : "Permits"}
          </button>
        ))}
      </div>
      {activeTab === "permits" ? <UnitPermitsTab unitId={id} companyId={companyId} /> : null}
      {activeTab === "toll-tags" ? <UnitTollTagsTab unitId={id} companyId={companyId} /> : null}
      {activeTab === "tasks" ? (
        <TasksTab operatingCompanyId={companyId} targetType="unit" targetId={id} targetLabel={entityLabel(null, id, "Unit")} />
      ) : null}
      {activeTab === "brakes" ? <UnitBrakesTab unitId={id} companyId={companyId} /> : null}
      {activeTab === "tires" ? <UnitTiresTab unitId={id} companyId={companyId} /> : null}
      {activeTab === "finance" ? <UnitFinanceLinkageTab unitId={id} companyId={companyId} /> : null}
    </div>
  );
}
