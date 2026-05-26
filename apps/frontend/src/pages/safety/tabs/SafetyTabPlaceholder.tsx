import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SAFETY_GROUPS } from "../../../components/safety/SAFETY_TABS_CONFIG";

type Props = {
  title: string;
  legacyHref?: string;
};

export function SafetyTabPlaceholder({ title, legacyHref }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const active = useMemo(() => {
    for (const group of SAFETY_GROUPS) {
      const tab = group.tabs.find((item) => item.label === title);
      if (tab) return { groupId: group.id, tabId: tab.id };
    }
    return { groupId: "settings", tabId: "settings" };
  }, [title]);

  const kpiQ = useQuery({
    queryKey: ["safety", "tab-kpis", active.groupId, active.tabId, companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiRequest<{ cards: Array<{ label: string; value: number }> }>(
        `/api/v1/safety/${encodeURIComponent(active.groupId)}/${encodeURIComponent(active.tabId)}/kpis?operating_company_id=${encodeURIComponent(companyId)}`
      ),
  });

  return (
    <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {(kpiQ.data?.cards ?? []).map((card) => (
          <div key={card.label} className="rounded border border-gray-200 bg-gray-50 p-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">{card.label}</div>
            <div className="text-sm font-semibold text-gray-900">{Number(card.value ?? 0).toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div className="rounded border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-slate-500">
        No records yet. Data-entry workflows ship in upcoming safety blocks.
      </div>
      {legacyHref ? (
        <Link to={legacyHref} className="inline-block text-xs text-blue-700 underline">
          Open legacy implementation
        </Link>
      ) : null}
    </div>
  );
}
