/**
 * CLOSURE-12 — PayrollIntegrationPage: labor dashboard over driver_finance settlements.
 * ACCT-F4431379 — driver pay comes ONLY from driver_finance; the QBO W-2 and benefits KPIs
 * (added into Total Labor Cost) are removed — QBO is out of scope for USMCA.
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
import { DatePicker } from "../../components/forms/DatePicker";

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
    { label: "Total Labor Cost", value: data ? cents(data.grand_total) : "—", sub: "Driver settlements (driver_finance)", highlight: true },
  ];

  function handleRefresh() {
    refreshMutation.mutate(
      { periodStart: period.start, periodEnd: period.end },
      {
        onSuccess: () => pushToast("Payroll data refreshed", "success"),
        onError: (e) => pushToast(String((e as Error).message || "Refresh failed"), "error"),
      }
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Payroll Integration"
        subtitle="Driver settlements from driver_finance — the only source of driver pay"
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1F2A44] disabled:opacity-50"
          >
            {refreshMutation.isPending ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {/* Period selector */}
      <div className="flex items-center gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <label className="text-xs font-medium text-gray-700">Period:</label>
        <DatePicker
          value={period.start}
          onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          className=""
        />
        <span className="text-gray-400">→</span>
        <DatePicker
          value={period.end}
          onChange={(next) => setPeriod((p) => ({ ...p, end: next }))}
          className=""
        />
      </div>

      {aggregateQuery.isError && <ListErrorBanner onRetry={() => void aggregateQuery.refetch()} />}

      {/* KPI cards */}
      <div className="grid gap-3 md:grid-cols-2">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`rounded-sm border p-4 ${kpi.highlight ? "border-[#E5E7EB] bg-[#F7F8FA]" : "border-gray-200 bg-[var(--surface-unselected)]"}`}>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpi.label}</div>
            <div className={`mt-1 text-page-title font-bold tabular-nums ${kpi.highlight ? "text-[#1F2A44]" : "text-gray-900"}`}>
              {aggregateQuery.isLoading ? "…" : kpi.value}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Class allocation bar */}
      {data && (
        <div className="rounded-sm border border-gray-200 bg-white p-4">
          <ClassAllocationView allocations={data.by_class} totalCents={data.grand_total} />
        </div>
      )}

      {/* Person table */}
      <div>
        <h3 className="mb-2 text-xs font-semibold text-gray-700">By Person</h3>
        {data ? (
          <PayrollAggregateTable persons={data.by_person} />
        ) : aggregateQuery.isLoading ? (
          <div className="py-8 text-center text-xs text-gray-400">Loading payroll data…</div>
        ) : null}
      </div>

      {data?.stale && (
        <p className="text-xs text-amber-600">Data may be stale (&gt;24h old). Click "Refresh" to update.</p>
      )}
    </div>
  );
}
