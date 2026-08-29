import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FINANCE_HUB_SCENARIOS_FLAG, getActiveScenarioSummary } from "../../api/financeScenarios";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

const dollars = (cents: number) => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });

// C8 — each tile is a real aggregate of this scenario's forecast_lines rows; the scenario detail
// page (ScenarioLinesTable) is the honest drill target, not a fabricated route — it's the exact
// same destination the "View scenario →" link above already goes to.
function Tile({
  label,
  value,
  tone,
  to,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  to: string;
}) {
  return <DrillKpiCard size="md" label={label} value={value} to={to} valueTone={tone === "negative" ? "critical" : "default"} />;
}

export function FinanceOverviewPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_SCENARIOS_FLAG, companyId);

  const summaryQuery = useQuery({
    queryKey: ["finance", "scenario-active-summary", companyId],
    queryFn: () => getActiveScenarioSummary(companyId),
    enabled: Boolean(companyId) && enabled,
  });
  const summary = summaryQuery.data?.summary ?? null;

  const header = (
    <div className="mb-4">
      <h1 className="text-lg font-semibold text-slate-800">Finance Overview</h1>
      <p className="text-sm text-slate-500">Rollup of the company's currently active forecast scenario.</p>
    </div>
  );

  if (flagLoading) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        <PageHeader title="Finance Overview" />
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
          Financial planning is not yet enabled for this company. (Feature flag <code>{FINANCE_HUB_SCENARIOS_FLAG}</code> is
          off.)
        </div>
      </div>
    );
  }

  if (summaryQuery.isError) {
    // GO-0028: a failed fetch must never render the same "No active scenario yet." text as a
    // genuinely absent scenario -- the owner would be told to go create a new one that may
    // already exist and simply failed to load.
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <ListErrorState
          title="Couldn't load the active scenario"
          status={0}
          message={userFacingApiError(summaryQuery.error, "Failed to load finance overview")}
          onRetry={() => void summaryQuery.refetch()}
        />
      </div>
    );
  }

  if (!summaryQuery.isLoading && !summary) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No active scenario yet.{" "}
          <Link to="/finance/scenarios" className="font-medium text-slate-800 underline">
            Create and activate one in Scenarios
          </Link>{" "}
          to see an overview here.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <FinanceModuleTabs />
      {header}
      {summaryQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : summary ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-sm border border-slate-200 bg-white p-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">{summary.scenario.name}</h2>
              <p className="text-xs text-slate-500">
                {summary.scenario.period_basis} · {summary.scenario.period_count} periods starting{" "}
                {summary.scenario.period_start}
              </p>
            </div>
            <Link to={`/finance/scenarios/${summary.scenario.id}`} className="text-xs font-medium text-slate-700 underline">
              View scenario →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Tile label="Estimated revenue" value={dollars(summary.totals.estimate_revenue_cents)} to={`/finance/scenarios/${summary.scenario.id}`} />
            <Tile label="Estimated expense" value={dollars(summary.totals.estimate_expense_cents)} to={`/finance/scenarios/${summary.scenario.id}`} />
            <Tile
              label="Estimated net"
              value={dollars(summary.totals.estimate_net_cents)}
              tone={summary.totals.estimate_net_cents >= 0 ? "positive" : "negative"}
              to={`/finance/scenarios/${summary.scenario.id}`}
            />
            {summary.totals.has_any_actuals ? (
              <>
                <Tile label="Actual revenue to date" value={dollars(summary.totals.actual_revenue_cents)} to={`/finance/scenarios/${summary.scenario.id}`} />
                <Tile label="Actual expense to date" value={dollars(summary.totals.actual_expense_cents)} to={`/finance/scenarios/${summary.scenario.id}`} />
                <Tile
                  label="Actual net to date"
                  value={dollars(summary.totals.actual_net_cents)}
                  tone={summary.totals.actual_net_cents >= 0 ? "positive" : "negative"}
                  to={`/finance/scenarios/${summary.scenario.id}`}
                />
              </>
            ) : (
              <div className="col-span-2 flex items-center rounded-sm border border-dashed border-slate-200 p-4 text-xs text-slate-500 md:col-span-3">
                No actuals recorded yet — record them on{" "}
                <Link to="/finance/projections" className="ml-1 font-medium text-slate-700 underline">
                  Projections
                </Link>
                .
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
