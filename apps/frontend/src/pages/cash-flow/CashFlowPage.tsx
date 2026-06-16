import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { DailyPredictionTab } from "./tabs/DailyPredictionTab";
import { ActualVsProjectedTab } from "./tabs/ActualVsProjectedTab";
import { ManualDailyProjectionsTab } from "./tabs/ManualDailyProjectionsTab";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { CASH_FORECAST_ENABLED_FLAG } from "../../api/forecast";

type CashFlowTabId = "daily_prediction" | "actual_vs_projected" | "manual_daily_projections";

export function CashFlowPage() {
  const [activeTab, setActiveTab] = useState<CashFlowTabId>("daily_prediction");
  const { selectedCompanyId } = useCompanyContext();
  // Block F: the hand-entered tab only appears once its OFF-by-default flag is on.
  const { enabled: manualForecastEnabled } = useFeatureFlag(CASH_FORECAST_ENABLED_FLAG, selectedCompanyId ?? undefined);
  const TABS: { id: CashFlowTabId; label: string }[] = [
    { id: "daily_prediction", label: "Projected (Auto)" },
    { id: "actual_vs_projected", label: "Actual vs Projected" },
    ...(manualForecastEnabled ? [{ id: "manual_daily_projections" as const, label: "Manual Daily Projections" }] : []),
  ];

  if (!selectedCompanyId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cash Flow" subtitle="Daily cash position — predicted income and expenses" />
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <TrendingUp className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">Select a company to view cash flow.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cash Flow"
        subtitle="Forward-looking daily cash position — predicted income and expenses"
      />
      <SecondaryNavTabs
        tabs={TABS}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as CashFlowTabId)}
      />
      {activeTab === "daily_prediction" && (
        <DailyPredictionTab operatingCompanyId={selectedCompanyId} />
      )}
      {activeTab === "actual_vs_projected" && (
        <ActualVsProjectedTab operatingCompanyId={selectedCompanyId} />
      )}
      {activeTab === "manual_daily_projections" && manualForecastEnabled && (
        <ManualDailyProjectionsTab operatingCompanyId={selectedCompanyId} />
      )}
    </div>
  );
}
