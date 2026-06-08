import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";

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
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [applied, setApplied] = useState(asOf);

  const query = useQuery({
    queryKey: ["reports", "cash-flow", companyId, applied],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiRequest<CashFlowReportResponse>(
        `/api/v1/reports/cash-flow?operating_company_id=${encodeURIComponent(companyId)}&as_of_date=${applied}`
      ),
  });

  const summary = useMemo(() => query.data, [query.data]);

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Cash flow" subtitle="Tenant-scoped liquidity snapshot (GAP-45)" />
      <ReportsSubNav />
      <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
        <label className="text-sm">
          As of
          <input type="date" className="ml-2 rounded border px-2 py-1" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <Button onClick={() => setApplied(asOf)}>Apply</Button>
      </div>
      {query.isLoading ? <p>Loading…</p> : null}
      {summary ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded border bg-white p-4">
            <div className="text-sm text-slate-600">Operating balance</div>
            <div className="text-2xl font-semibold">{money(summary.operating_balance_cents)}</div>
          </div>
          <div className="rounded border bg-white p-4">
            <div className="text-sm text-slate-600">Scoped loads (OCI)</div>
            <div className="text-2xl font-semibold">{summary.scoped_load_count}</div>
            <div className="text-xs text-slate-500">Company: {summary.operating_company_id}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CashFlowReport;
