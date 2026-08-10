import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getCustomerProfitability,
  type CustomerProfitabilityRow,
  type CustomerProfitabilityResponse,
  type CustomerProfitFlag,
} from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";

const DEFAULT_MIN_REVENUE_CENTS = 100_000; // $1,000

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function pct(n: number) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const FLAG_UI: Record<CustomerProfitFlag, { className: string; label: string }> = {
  high_margin: { className: "border-slate-300 bg-slate-100 text-[#1f2a44]", label: "high_margin" },
  low_margin: { className: "border-slate-300 bg-slate-100 text-slate-700", label: "low_margin" },
  past_due: { className: "border-slate-300 bg-slate-100 text-slate-700", label: "past_due" },
  declining_revenue: { className: "border-slate-200 bg-slate-50 text-slate-800", label: "declining_revenue" },
};

export function CustomerProfitabilityPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [minRevDollars, setMinRevDollars] = useState("1000");
  const [appliedMinCents, setAppliedMinCents] = useState(DEFAULT_MIN_REVENUE_CENTS);

  const query = useQuery({
    queryKey: ["reports", "customer-profitability", companyId, applied.start, applied.end, appliedMinCents],
    queryFn: () =>
      getCustomerProfitability({
        operating_company_id: companyId,
        period_start: applied.start,
        period_end: applied.end,
        min_revenue_cents: appliedMinCents,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = query.data?.by_customer ?? [];

  const profitabilityColumns = useMemo<ParityColumn<CustomerProfitabilityRow>[]>(
    () => [
      { key: "customer_name", label: "Customer", sortable: true, render: (r) => <span className="font-medium text-gray-900">{entityLabel(r.customer_name, r.customer_id, "Customer")}</span> },
      { key: "load_count", label: "Loads", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "revenue_cents", label: "Revenue", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.revenue_cents) },
      { key: "direct_cost_cents", label: "Direct cost", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.direct_cost_cents) },
      { key: "gross_margin_cents", label: "Margin", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.gross_margin_cents) },
      { key: "gross_margin_pct", label: "Margin %", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => pct(r.gross_margin_pct) },
      {
        key: "ar_aging_balance_cents",
        label: "A/R aging",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (r) => (
          <span
            className="cursor-pointer text-slate-700 underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/reports/ar-aging?customer_id=${encodeURIComponent(r.customer_id)}`);
            }}
          >
            {money(r.ar_aging_balance_cents)}
          </span>
        ),
      },
      {
        key: "days_since_last_load",
        label: "Last load",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (r) => (r.days_since_last_load == null ? "—" : `${r.days_since_last_load}d`),
      },
      {
        key: "flags",
        label: "Flags",
        render: (r) => (
          <div className="flex flex-wrap gap-1">
            {(r.flags ?? []).map((f) => {
              const meta = FLAG_UI[f];
              return (
                <span key={f} className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`} title={meta.label}>
                  {meta.label}
                </span>
              );
            })}
          </div>
        ),
      },
    ],
    [navigate],
  );

  const top5Chart = useMemo(() => {
    const rows = [...(query.data?.by_customer ?? [])];
    rows.sort((a, b) => b.revenue_cents - a.revenue_cents);
    return rows.slice(0, 5).map((r) => ({
      name: r.customer_name.length > 14 ? `${r.customer_name.slice(0, 12)}…` : r.customer_name,
      revenue: r.revenue_cents,
      marginPct: r.gross_margin_pct,
    }));
  }, [query.data?.by_customer]);

  function applyFilters() {
    setApplied({ ...period });
    const d = minRevDollars.trim() === "" ? DEFAULT_MIN_REVENUE_CENTS : Math.round(Number(minRevDollars) * 100) || 0;
    setAppliedMinCents(Math.max(0, d));
  }

  function exportCsv(data: CustomerProfitabilityResponse) {
    const header = ["Customer", "Loads", "Revenue", "DirectCost", "Margin", "MarginPct", "ARAging", "DaysSinceLoad", "Flags"];
    const lines = (data.by_customer ?? []).map((r) =>
      [
        `"${r.customer_name.replace(/"/g, '""')}"`,
        r.load_count,
        r.revenue_cents,
        r.direct_cost_cents,
        r.gross_margin_cents,
        r.gross_margin_pct,
        r.ar_aging_balance_cents,
        r.days_since_last_load ?? "",
        (r.flags ?? []).join("|"),
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-profitability-${applied.start}-${applied.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="Customer profitability"
        subtitle="Revenue, direct cost, and margin by customer"
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print this page
            </Button>
            <Button size="sm" variant="secondary" disabled={!query.data} onClick={() => query.data && exportCsv(query.data)}>
              Export CSV
            </Button>
          </div>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {query.isError ? <ReportBlockTPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}

      <div className="no-print flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          Min revenue (USD)
          {/* M-1: dollars-mode filter; Math.round(minRevDollars*100)=min_revenue_cents byte-for-byte. */}
          <MoneyInput valueDollars={minRevDollars ? Number(minRevDollars) : null} onChangeDollars={(d) => setMinRevDollars(d == null ? "" : String(d))} ariaLabel="Min revenue (USD)" className="mt-1 w-28" />
        </label>
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
            value={period.start}
            onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
            value={period.end}
            onChange={(next) => setPeriod((p) => ({ ...p, end: next }))}
          />
        </label>
        <Button size="sm" onClick={applyFilters}>
          Apply
        </Button>
      </div>

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {query.data ? (
        <>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Revenue</div>
              <div className="text-lg font-semibold">{money(query.data.totals.revenue_cents)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Direct cost</div>
              <div className="text-lg font-semibold">{money(query.data.totals.direct_cost_cents)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Gross margin</div>
              <div className="text-lg font-semibold">{money(query.data.totals.gross_margin_cents)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Margin %</div>
              <div className="text-lg font-semibold">{pct(query.data.totals.gross_margin_pct)}</div>
            </div>
          </div>

          <ParityTable
            rows={rows}
            columns={profitabilityColumns}
            rowKey={(r) => r.customer_id}
            loading={query.isPending || (query.isFetching && rows.length === 0)}
            storageKey="customer-profitability"
            emptyText="No customers match the current filters."
            exportFilename={`customer-profitability-${applied.start}-${applied.end}`}
            onRowClick={(r) => navigate(`/customers/${r.customer_id}?tab=billing`)}
          />

          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold">Top 5 customers by revenue (margin % overlay)</div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={top5Chart} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tickFormatter={(v) => money(Number(v))} width={72} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} width={40} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "marginPct" ? [`${Number(value).toFixed(1)}%`, "Margin %"] : [money(Number(value)), "Revenue"]
                    }
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#0d9488" />
                  <Line yAxisId="right" type="monotone" dataKey="marginPct" name="Margin %" stroke="#1F2A44" strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
