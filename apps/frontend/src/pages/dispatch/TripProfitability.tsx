/**
 * TripProfitability — Company Settlement Report / Trip Profitability view.
 *
 * Lane B (Block 9) owns this file.
 * Lane A (Block 12) registers the route in manifest.tsx:
 *   <Route path="/reports/trip-profitability" element={<TripProfitability />} />
 *
 * Data: GET /api/v1/reports/trip-profitability
 * Aggregates NB + SB per driver_settlement (load_bookended model).
 * Read-only. No new financial code.
 */
import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { getTripProfitability, type TripProfitabilityRow } from "../../lib/loadProfit";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { ReportsSubNav } from "../reports/ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    (Number(cents) || 0) / 100
  );
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type SortKey = keyof TripProfitabilityRow;

function marginClass(pct: number) {
  if (pct < 0) return "text-red-600 font-semibold";
  if (pct < 10) return "text-amber-700";
  return "text-green-700";
}

export function TripProfitability() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [sortKey, setSortKey] = useState<SortKey>("trip_closed_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const query = useQuery({
    queryKey: ["reports", "trip-profitability", companyId, applied.start, applied.end],
    queryFn: () =>
      getTripProfitability({ operating_company_id: companyId, from: applied.start, to: applied.end }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const sorted = useMemo(() => {
    const rows = query.data?.rows ?? [];
    const mul = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1 * mul;
      if (bv == null) return -1 * mul;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * mul;
      return ((Number(av) || 0) - (Number(bv) || 0)) * mul;
    });
    return copy;
  }, [query.data?.rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const t = query.data?.totals;

  return (
    <div className="space-y-3">
      <ReportsSubNav />
      <PageHeader title="Trip Profitability" subtitle="Company Settlement Report — NB + SB roll-up per trip" />

      {/* Filters */}
      <section className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3">
        <label className="text-sm">
          From
          <DatePicker
            className="ml-2 rounded border px-2 py-1"
            value={period.start}
            onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          />
        </label>
        <label className="text-sm">
          To
          <DatePicker
            className="ml-2 rounded border px-2 py-1"
            value={period.end}
            onChange={(next) => setPeriod((p) => ({ ...p, end: next }))}
          />
        </label>
        <button
          type="button"
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          onClick={() => setApplied(period)}
        >
          Apply
        </button>
      </section>

      {/* State messages */}
      {query.isLoading && (
        <div className="rounded border bg-white p-4 text-sm text-slate-500">Loading…</div>
      )}
      {query.isError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load trip profitability.{" "}
          <button type="button" className="underline" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      )}

      {/* Totals cards */}
      {t && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
          {[
            { label: "Trips", value: String(t.trip_count) },
            { label: "Revenue", value: money(t.revenue_cents) },
            { label: "Driver pay", value: money(t.driver_pay_cents) },
            { label: "Fuel", value: money(t.fuel_cents) },
            {
              label: "Net profit",
              value: money(t.net_profit_cents),
              highlight: t.net_profit_cents < 0 ? "text-red-600" : "text-green-700",
            },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="rounded border bg-white p-3">
              <div className="text-xs text-slate-500">{label}</div>
              <div className={`text-lg font-semibold ${highlight ?? "text-slate-900"}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {query.data && sorted.length === 0 && (
        <div className="rounded border bg-white p-4 text-sm text-slate-500">
          No trips closed in this period.
        </div>
      )}

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                {(
                  [
                    ["settlement_display_id", "Trip #"],
                    ["driver_name", "Driver"],
                    ["nb_load_number", "NB Load"],
                    ["sb_load_number", "SB Load"],
                    ["revenue_cents", "Revenue"],
                    ["driver_pay_cents", "Driver Pay"],
                    ["fuel_cents", "Fuel"],
                    ["net_profit_cents", "Net Profit"],
                    ["margin_pct", "Margin %"],
                    ["trip_closed_at", "Closed"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    className="cursor-pointer select-none whitespace-nowrap px-3 py-2 hover:bg-slate-100"
                    onClick={() => toggleSort(key)}
                  >
                    {label}
                    {sortIcon(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((row) => (
                <tr key={row.settlement_id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {row.settlement_display_id ?? row.settlement_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2">{row.driver_name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.nb_load_number ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.sb_load_number ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{money(row.revenue_cents)}</td>
                  <td className="px-3 py-2 text-right">{money(row.driver_pay_cents)}</td>
                  <td className="px-3 py-2 text-right">{money(row.fuel_cents)}</td>
                  <td className={`px-3 py-2 text-right ${marginClass(row.margin_pct)}`}>
                    {money(row.net_profit_cents)}
                  </td>
                  <td className={`px-3 py-2 text-right ${marginClass(row.margin_pct)}`}>
                    {row.margin_pct.toFixed(1)}%
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {row.trip_closed_at ? new Date(row.trip_closed_at).toLocaleDateString() : "Open"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
