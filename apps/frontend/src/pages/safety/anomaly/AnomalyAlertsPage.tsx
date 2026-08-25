import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AnomalyDashboard } from "./AnomalyDashboard";
import { RuleEditor } from "./RuleEditor";
import { PageHeader } from "../../../components/forms/shared/PageHeader";

type TabId = "alerts" | "rules";

function parseTab(raw: string | null, isOwner: boolean): TabId {
  if (raw === "rules" && isOwner) return "rules";
  return "alerts";
}

export function AnomalyAlertsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const companyId = selectedCompanyId ?? "";
  const isOwner = auth.user?.role === "Owner";
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"), isOwner);

  const setTab = (next: TabId) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "alerts") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-3 p-4">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see TrainingProgramsPage.tsx sibling comment. */}
      <PageHeader title="Anomaly Alerts" breadcrumb={[{ label: "Safety" }, { label: "Anomaly Alerts" }]} backHref="/safety" />
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("alerts")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${tab === "alerts" ? "bg-slate-100 text-slate-700" : "text-gray-700 hover:bg-gray-100"}`}
        >
          Alerts
        </button>
        {isOwner ? (
          <button
            type="button"
            onClick={() => setTab("rules")}
            className={`rounded px-3 py-1.5 text-sm font-medium ${tab === "rules" ? "bg-slate-100 text-slate-700" : "text-gray-700 hover:bg-gray-100"}`}
          >
            Rules
          </button>
        ) : null}
      </div>
      {tab === "alerts" ? <AnomalyDashboard operatingCompanyId={companyId} /> : null}
      {tab === "rules" && isOwner ? <RuleEditor operatingCompanyId={companyId} isOwner={isOwner} /> : null}
    </div>
  );
}
