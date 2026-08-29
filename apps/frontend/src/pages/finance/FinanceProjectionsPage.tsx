import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FINANCE_HUB_SCENARIOS_FLAG, getScenarioDetail, getActiveScenarioSummary } from "../../api/financeScenarios";
import { ScenarioLinesTable } from "./components/ScenarioLinesTable";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

export function FinanceProjectionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_SCENARIOS_FLAG, companyId);

  const summaryQuery = useQuery({
    queryKey: ["finance", "scenario-active-summary", companyId],
    queryFn: () => getActiveScenarioSummary(companyId),
    enabled: Boolean(companyId) && enabled,
  });
  const activeScenarioId = summaryQuery.data?.summary?.scenario.id ?? null;

  const detailQueryKey = ["finance", "scenario-detail", companyId, activeScenarioId ?? ""];
  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => getScenarioDetail(activeScenarioId ?? "", companyId),
    enabled: Boolean(companyId && activeScenarioId),
  });

  const header = (
    <div className="mb-4">
      <h1 className="text-lg font-semibold text-slate-800">Projections</h1>
      <p className="text-sm text-slate-500">
        Period-by-period estimate vs. actual for the company's currently active scenario.
      </p>
    </div>
  );

  if (flagLoading) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        <PageHeader title="Projections" />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Financial projections are not yet enabled for this company. (Feature flag <code>{FINANCE_HUB_SCENARIOS_FLAG}</code>{" "}
          is off.)
        </div>
      </div>
    );
  }

  if (summaryQuery.isError) {
    // GO-0028: a failed fetch must never render the same "No active scenario yet." text as a
    // genuinely absent scenario.
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <ListErrorState
          title="Couldn't load the active scenario"
          status={0}
          message={userFacingApiError(summaryQuery.error, "Failed to load projections")}
          onRetry={() => void summaryQuery.refetch()}
        />
      </div>
    );
  }

  if (!summaryQuery.isLoading && !activeScenarioId) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No active scenario yet.{" "}
          <Link to="/finance/scenarios" className="font-medium text-slate-800 underline">
            Create and activate one in Scenarios
          </Link>{" "}
          to see projections here.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <FinanceModuleTabs />
      {header}
      {summaryQuery.isLoading || detailQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : detailQuery.data ? (
        <div className="space-y-4">
          <div className="rounded-sm border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{detailQuery.data.scenario.name}</h2>
                <p className="text-xs text-slate-500">
                  {detailQuery.data.scenario.period_basis} · {detailQuery.data.scenario.period_count} periods
                </p>
              </div>
              <Link to={`/finance/scenarios/${detailQuery.data.scenario.id}`} className="text-xs font-medium text-slate-700 underline">
                Full detail →
              </Link>
            </div>
          </div>
          <ScenarioLinesTable
            lines={detailQuery.data.lines}
            operatingCompanyId={companyId}
            editable
            invalidateKey={detailQueryKey}
          />
        </div>
      ) : null}
    </div>
  );
}
