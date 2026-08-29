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

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function CashFlowReport() {
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const today = companyToday();
  const [appliedAsOf, setAppliedAsOf] = useState(today);
  const staged = useStagedListFilters({
    applied: { asOfDate: appliedAsOf },
    empty: { asOfDate: today },
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
      <CollapsedListFilters
        activeFilterCount={appliedAsOf !== today ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-cash-flow"
        className="flex flex-wrap items-end gap-3 rounded-sm border bg-white p-4"
      >
        <label className="text-sm">
          As of
          <DatePicker className="ml-2" value={staged.draft.asOfDate} onChange={(next) => staged.setDraft({ asOfDate: next })} />
        </label>
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
            <div className="text-sm text-slate-600">Operating balance</div>
            <div className="text-2xl font-semibold">{money(summary.operating_balance_cents)}</div>
          </div>
          <div className="rounded-sm border bg-white p-4">
            <div className="text-sm text-slate-600">Scoped loads (OCI)</div>
            <div className="text-2xl font-semibold">{summary.scoped_load_count}</div>
            <div className="text-xs text-slate-500">Company: {selectedCompany?.legal_name ?? "—"}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CashFlowReport;
