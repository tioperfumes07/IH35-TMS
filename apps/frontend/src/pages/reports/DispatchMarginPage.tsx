import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { getDispatchMargin, type DispatchMarginRow } from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function DispatchMarginPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");

  const query = useQuery({
    queryKey: ["reports", "dispatch-margin", companyId, applied.start, applied.end, basis],
    queryFn: () =>
      getDispatchMargin({
        operating_company_id: companyId,
        from: applied.start,
        to: applied.end,
        basis,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const sorted = query.data?.rows ?? [];

  const columns = useMemo<ParityColumn<DispatchMarginRow>[]>(
    () => [
      { key: "load_number", label: "Load", sortable: true, render: (row) => <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} /> },
      { key: "customer_name", label: "Customer", sortable: true, render: (row) => <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} /> },
      { key: "revenue_cents", label: "Revenue", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.revenue_cents) },
      { key: "direct_cost_cents", label: "Direct cost", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.direct_cost_cents) },
      { key: "margin_cents", label: "Margin", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.margin_cents) },
      { key: "margin_pct", label: "Margin %", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => `${row.margin_pct.toFixed(1)}%` },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <ReportsSubNav />
      <PageHeader
        title="Dispatch margin"
        backHref="/reports"
        breadcrumb={["Reports", "Dispatch Margin"]}
      />

      <section className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white p-3">
        <label className="text-sm">
          From
          <DatePicker className="ml-2 rounded-sm border px-2 py-1" value={period.start} onChange={(next) => setPeriod((p) => ({ ...p, start: next }))} />
        </label>
        <label className="text-sm">
          To
          <DatePicker className="ml-2 rounded-sm border px-2 py-1" value={period.end} onChange={(next) => setPeriod((p) => ({ ...p, end: next }))} />
        </label>
        <label className="text-sm">
          Basis
          <select className="ml-2 rounded-sm border px-2 py-1" value={basis} onChange={(e) => setBasis(e.target.value as "accrual" | "cash")}>
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <Button onClick={() => setApplied(period)}>Apply</Button>
      </section>

      {query.isLoading ? <div className="rounded-sm border bg-white p-4 text-sm text-slate-500">Loading…</div> : null}
      {query.isError ? (
        <ListErrorState
          title="Couldn't load dispatch margin"
          {...formatQueryErrorDetail(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Revenue</div>
              <div className="text-lg font-semibold">{money(query.data.totals.revenue_cents)}</div>
            </div>
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Direct cost</div>
              <div className="text-lg font-semibold">{money(query.data.totals.direct_cost_cents)}</div>
            </div>
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Margin</div>
              <div className="text-lg font-semibold">{money(query.data.totals.margin_cents)}</div>
            </div>
            <div className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">Loads</div>
              <div className="text-lg font-semibold">{query.data.totals.load_count}</div>
            </div>
          </div>

          <ParityTable
            rows={sorted}
            columns={columns}
            rowKey={(row) => row.load_id}
            loading={query.isPending || (query.isFetching && sorted.length === 0)}
            storageKey="dispatch-margin"
            emptyText="No loads in this period."
          />
        </>
      ) : null}
    </div>
  );
}
