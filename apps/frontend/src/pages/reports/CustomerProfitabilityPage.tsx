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

type SortKey = keyof CustomerProfitabilityRow;

export function CustomerProfitabilityPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [minRevDollars, setMinRevDollars] = useState("1000");
  const [appliedMinCents, setAppliedMinCents] = useState(DEFAULT_MIN_REVENUE_CENTS);
  const [sortKey, setSortKey] = useState<SortKey>("revenue_cents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  const sorted = useMemo(() => {
    const rows = query.data?.by_customer ?? [];
    const mul = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "customer_name") return a.customer_name.localeCompare(b.customer_name) * mul;
      const av = a[sortKey] as number | string | null;
      const bv = b[sortKey] as number | string | null;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      if (av == null && bv == null) return 0;
      if (av == null) return 1 * mul;
      if (bv == null) return -1 * mul;
      return 0;
    });
    return copy;
  }, [query.data?.by_customer, sortKey, sortDir]);

  const top5Chart = useMemo(() => {
    const rows = [...(query.data?.by_customer ?? [])];
    rows.sort((a, b) => b.revenue_cents - a.revenue_cents);
    return rows.slice(0, 5).map((r) => ({
      name: r.customer_name.length > 14 ? `${r.customer_name.slice(0, 12)}…` : r.customer_name,
      revenue: r.revenue_cents,
      marginPct: r.gross_margin_pct,
    }));
  }, [query.data?.by_customer]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

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

      <div className="no-print flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          Min revenue (USD)
          {/* M-1: dollars-mode filter; Math.round(minRevDollars*100)=min_revenue_cents byte-for-byte. */}
          <MoneyInput valueDollars={minRevDollars ? Number(minRevDollars) : null} onChangeDollars={(d) => setMinRevDollars(d == null ? "" : String(d))} ariaLabel="Min revenue (USD)" className="mt-1 w-28" />
        </label>
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block h-9 rounded border border-gray-300 px-2"
            value={period.start}
            onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block h-9 rounded border border-gray-300 px-2"
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
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Revenue</div>
              <div className="text-lg font-semibold">{money(query.data.totals.revenue_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Direct cost</div>
              <div className="text-lg font-semibold">{money(query.data.totals.direct_cost_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Gross margin</div>
              <div className="text-lg font-semibold">{money(query.data.totals.gross_margin_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Margin %</div>
              <div className="text-lg font-semibold">{pct(query.data.totals.gross_margin_pct)}</div>
            </div>
          </div>

          <div className="overflow-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                <tr>
                  <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("customer_name")}>
                    Customer
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("load_count")}>
                    Loads
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("revenue_cents")}>
                    Revenue
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("direct_cost_cents")}>
                    Direct cost
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("gross_margin_cents")}>
                    Margin
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("gross_margin_pct")}>
                    Margin %
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("ar_aging_balance_cents")}>
                    A/R aging
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("days_since_last_load")}>
                    Last load
                  </th>
                  <th className="px-2 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.customer_id}
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    onClick={() => navigate(`/customers/${r.customer_id}?tab=billing`)}
                  >
                    <td className="px-2 py-2 font-medium text-gray-900">{r.customer_name}</td>
                    <td className="px-2 py-2 text-right">{r.load_count}</td>
                    <td className="px-2 py-2 text-right">{money(r.revenue_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.direct_cost_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.gross_margin_cents)}</td>
                    <td className="px-2 py-2 text-right">{pct(r.gross_margin_pct)}</td>
                    <td
                      className="px-2 py-2 text-right text-slate-700 underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/reports/ar-aging?customer_id=${encodeURIComponent(r.customer_id)}`);
                      }}
                    >
                      {money(r.ar_aging_balance_cents)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r.days_since_last_load == null ? "—" : `${r.days_since_last_load}d`}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(r.flags ?? []).map((f) => {
                          const meta = FLAG_UI[f];
                          return (
                            <span key={f} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`} title={meta.label}>
                              {meta.label}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold">Top 5 customers by revenue (margin % overlay)</div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={top5Chart} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tickFormatter={(v) => money(Number(v))} width={72} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} width={40} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "marginPct" ? [`${value.toFixed(1)}%`, "Margin %"] : [money(Number(value)), "Revenue"]
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
