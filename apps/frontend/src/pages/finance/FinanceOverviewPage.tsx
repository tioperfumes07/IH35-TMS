import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FINANCE_HUB_SCENARIOS_FLAG, getActiveScenarioSummary } from "../../api/financeScenarios";

const dollars = (cents: number) => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });

function Tile({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-sm border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold ${
          tone === "negative" ? "text-red-600" : "text-slate-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
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
            <Tile label="Estimated revenue" value={dollars(summary.totals.estimate_revenue_cents)} />
            <Tile label="Estimated expense" value={dollars(summary.totals.estimate_expense_cents)} />
            <Tile
              label="Estimated net"
              value={dollars(summary.totals.estimate_net_cents)}
              tone={summary.totals.estimate_net_cents >= 0 ? "positive" : "negative"}
            />
            {summary.totals.has_any_actuals ? (
              <>
                <Tile label="Actual revenue to date" value={dollars(summary.totals.actual_revenue_cents)} />
                <Tile label="Actual expense to date" value={dollars(summary.totals.actual_expense_cents)} />
                <Tile
                  label="Actual net to date"
                  value={dollars(summary.totals.actual_net_cents)}
                  tone={summary.totals.actual_net_cents >= 0 ? "positive" : "negative"}
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
