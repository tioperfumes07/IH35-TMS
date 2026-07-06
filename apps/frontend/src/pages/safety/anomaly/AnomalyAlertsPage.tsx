import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AnomalyDashboard } from "./AnomalyDashboard";
import { RuleEditor } from "./RuleEditor";
import { useState } from "react";

export function AnomalyAlertsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const companyId = selectedCompanyId ?? "";
  const isOwner = auth.user?.role === "Owner";
  const [tab, setTab] = useState<"alerts" | "rules">("alerts");

  return (
    <div className="space-y-3 p-4">
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
