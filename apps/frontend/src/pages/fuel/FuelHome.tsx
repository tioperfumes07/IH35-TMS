import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";

type FraudSummary = {
  open_critical: number;
  open_total: number;
};

async function fetchFraudSummary(companyId: string): Promise<FraudSummary> {
  return apiRequest(`/api/fuel/fraud-alerts/summary?operating_company_id=${encodeURIComponent(companyId)}`);
}

export function FuelFraudAlertsKpiCard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const summaryQuery = useQuery({
    queryKey: ["fuel", "fraud-alerts", "summary", companyId],
    queryFn: () => fetchFraudSummary(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const openCritical = summaryQuery.data?.open_critical ?? 0;
  const tone = openCritical > 0 ? "border-red-300 bg-red-50" : "border-gray-200 bg-white";

  return (
    <Link
      to="/fuel/fraud-alerts"
      className={`block rounded border px-3 py-2 text-[11px] transition hover:shadow-sm ${tone}`}
    >
      <div className="text-[10px] uppercase text-gray-500">Open Fraud Alerts</div>
      <div className={`text-lg font-semibold ${openCritical > 0 ? "text-red-700" : "text-gray-900"}`}>
        {openCritical}
      </div>
      <div className="text-[10px] text-gray-600">
        {summaryQuery.data?.open_total ?? 0} total open · CAP-11 fraud monitor
      </div>
    </Link>
  );
}

export function FuelHomePage() {
  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <FuelFraudAlertsKpiCard />
      </div>
    </div>
  );
}
