/**
 * CLOSURE-12 — PayrollIntegrationPage: unified TMS↔QBO labor dashboard.
 * Route: /payroll-integration
 */
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { usePayrollAggregate, usePayrollRefresh } from "../../hooks/usePayrollAggregate";
import { PayrollAggregateTable } from "./PayrollAggregateTable";
import { ClassAllocationView } from "./ClassAllocationView";
import { useToast } from "../../components/Toast";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

function cents(n: number) {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

export function PayrollIntegrationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";

  const [period, setPeriod] = useState(currentMonthRange);

  const aggregateQuery = usePayrollAggregate(companyId, period.start, period.end);
  const refreshMutation = usePayrollRefresh(companyId);

  const data = aggregateQuery.data;

  const kpis = [
    { label: "Driver Settlements", value: data ? cents(data.driver_total) : "—", sub: "1099 drivers" },
    { label: "W-2 Payroll", value: data ? cents(data.w2_total) : "—", sub: "Office & W-2 staff" },
    { label: "Benefits", value: data ? cents(data.benefits) : "—", sub: "Employer contributions" },
    { label: "Total Labor Cost", value: data ? cents(data.grand_total) : "—", sub: "All classes combined", highlight: true },
  ];

  function handleRefresh() {
    refreshMutation.mutate(
      { periodStart: period.start, periodEnd: period.end },
      {
        onSuccess: () => pushToast("Payroll data refreshed from QBO", "success"),
        onError: (e) => pushToast(String((e as Error).message || "Refresh failed"), "error"),
      }
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Payroll Integration"
        subtitle="Unified TMS driver settlements + QBO W-2 payroll view"
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {refreshMutation.isPending ? "Refreshing…" : "Refresh from QBO"}
          </button>
        }
      />

      {/* Period selector */}
      <div className="flex items-center gap-3 rounded border border-gray-200 bg-white p-3">
        <label className="text-sm font-medium text-gray-700">Period:</label>
        <input
          type="date"
          value={period.start}
          onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <span className="text-gray-400">→</span>
        <input
          type="date"
          value={period.end}
          onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      {aggregateQuery.isError && <ListErrorBanner onRetry={() => void aggregateQuery.refetch()} />}

      {/* 4 KPI cards */}
      <div className="grid gap-3 md:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`rounded border p-4 ${kpi.highlight ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"}`}>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpi.label}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${kpi.highlight ? "text-blue-700" : "text-gray-900"}`}>
              {aggregateQuery.isLoading ? "…" : kpi.value}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Class allocation bar */}
      {data && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <ClassAllocationView allocations={data.by_class} totalCents={data.grand_total} />
        </div>
      )}

      {/* Person table */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">By Person</h3>
        {data ? (
          <PayrollAggregateTable persons={data.by_person} />
        ) : aggregateQuery.isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading payroll data…</div>
        ) : null}
      </div>

      {data?.stale && (
        <p className="text-xs text-amber-600">Data may be stale (&gt;24h old). Click "Refresh from QBO" to update.</p>
      )}
    </div>
  );
}
