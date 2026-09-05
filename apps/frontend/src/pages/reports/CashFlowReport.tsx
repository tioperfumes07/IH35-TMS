import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { companyToday } from "../../lib/businessDate";

type CashFlowReportResponse = {
  operating_company_id: string;
  as_of_date: string;
  operating_balance_cents: number;
  scoped_load_count: number;
};

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

export function CashFlowReport() {
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const today = companyToday();
  const [appliedAsOf, setAppliedAsOf] = useState(today);
  const staged = useStagedListFilters({
    applied: { asOfDate: appliedAsOf, basis: "accrual", groupBy: "month" },
    empty: { asOfDate: today, basis: "accrual", groupBy: "month" },
    onApply: (next) => setAppliedAsOf(next.asOfDate),
  });

  const query = useQuery({
    queryKey: ["reports", "cash-flow", companyId, appliedAsOf],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiRequest<CashFlowReportResponse>(
        `/api/v1/reports/cash-flow?operating_company_id=${encodeURIComponent(companyId)}&as_of_date=${appliedAsOf}`
      ),
  });

  const summary = useMemo(() => query.data, [query.data]);

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Cash flow"
        subtitle="Tenant-scoped liquidity snapshot (GAP-45)"
        backHref="/reports"
        breadcrumb={["Reports", "Cash Flow"]}
      />
      <ReportsSubNav />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            if (!summary) return;
            const lines = [
              "operating_company_id,as_of_date,operating_balance_cents,scoped_load_count",
              `${summary.operating_company_id},${summary.as_of_date},${summary.operating_balance_cents},${summary.scoped_load_count}`,
            ];
            const blob = new Blob([lines.join("\n")], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "cash-flow-report.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Print
        </button>
      </div>
      <CollapsedListFilters
        activeFilterCount={appliedAsOf !== today ? 1 : 0}
        defaultOpen={true}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-cash-flow"
        className="flex flex-wrap items-end gap-3 rounded-sm border bg-white p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            As of
            <DatePicker className="ml-2" value={staged.draft.asOfDate} onChange={(next) => staged.setDraft({ ...staged.draft, asOfDate: next })} />
          </label>
          <label className="text-xs">
            Basis
            <select
              className="ml-2 h-9 rounded-sm border border-gray-300 px-2 text-xs"
              value={staged.draft.basis}
              onChange={(e) => staged.setDraft({ ...staged.draft, basis: e.target.value })}
              data-testid="reports-cash-flow-basis"
            >
              <option value="accrual">Accrual</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label className="text-xs">
            Group by
            <select
              className="ml-2 h-9 rounded-sm border border-gray-300 px-2 text-xs"
              value={staged.draft.groupBy}
              onChange={(e) => staged.setDraft({ ...staged.draft, groupBy: e.target.value })}
              data-testid="reports-cash-flow-group-by"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
        </div>
      </CollapsedListFilters>
      {query.isLoading ? <p>Loading…</p> : null}
      {query.isError ? (
        <ListErrorState
          title="Couldn't load cash flow"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {summary ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-sm border bg-white p-4">
            <div className="text-xs text-slate-600">Operating balance</div>
            <div className="text-page-title font-semibold">{money(summary.operating_balance_cents)}</div>
          </div>
          <div className="rounded-sm border bg-white p-4">
            <div className="text-xs text-slate-600">Scoped loads (OCI)</div>
            <div className="text-page-title font-semibold">{summary.scoped_load_count}</div>
            <div className="text-xs text-slate-500">Company: {selectedCompany?.legal_name ?? "—"}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CashFlowReport;
