import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCashFlowOverview, type CashFlowOverviewResponse } from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";

const PAYROLL_ALERT_CENTS = 50_000_00;
const DIP_ATTENTION_CENTS = 25_000_00;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Illustrative 30-day curve from backend net change (straight-line blend). */
function buildProjectionSeries(data: CashFlowOverviewResponse) {
  const start =
    data.current_state.operating_balance_cents +
    data.current_state.dip_balance_cents +
    data.current_state.payroll_balance_cents;
  const net = data.next_30_days.net_projected_change_cents;
  const ar = data.next_30_days.expected_ar_collections_cents;
  const ap = data.next_30_days.expected_ap_outflows_cents;
  const st = data.next_30_days.expected_settlement_outflows_cents;
  const rows: Array<{
    date: string;
    balance: number;
    balanceHigh: number;
    balanceLow: number;
    arPortion: number;
    apPortion: number;
    settlePortion: number;
  }> = [];
  const baseDate = data.as_of_date.slice(0, 10);
  for (let i = 0; i < 30; i++) {
    const t = (i + 1) / 30;
    const balance = Math.round(start + net * t);
    const variance = Math.round(balance * 0.1);
    rows.push({
      date: addDays(baseDate, i + 1),
      balance,
      balanceHigh: balance + variance,
      balanceLow: balance - variance,
      arPortion: Math.round((ar / 30) * (i + 1)),
      apPortion: Math.round((ap / 30) * (i + 1)),
      settlePortion: Math.round((st / 30) * (i + 1)),
    });
  }
  return rows;
}

function MiniSparkline({ values }: { values: number[] }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Line type="monotone" dataKey="v" stroke="#2563eb" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowOverviewPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));

  const query = useQuery({
    queryKey: ["reports", "cash-flow-overview", companyId, asOf],
    queryFn: () => getCashFlowOverview({ operating_company_id: companyId, as_of_date: asOf }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const projection = useMemo(() => (query.data ? buildProjectionSeries(query.data) : []), [query.data]);

  const kpiSpark = useMemo(() => {
    if (!query.data) return [0, 0, 0, 0, 0, 0, 0];
    const inf = query.data.historical.last_7_days_inflows_cents;
    const out = query.data.historical.last_7_days_outflows_cents;
    return Array.from({ length: 7 }, (_, i) => Math.round(((i + 1) / 7) * (inf - out)));
  }, [query.data]);

  const bar7 = useMemo(() => {
    if (!query.data) return [];
    return [
      { name: "Inflows", v: query.data.historical.last_7_days_inflows_cents },
      { name: "Outflows", v: query.data.historical.last_7_days_outflows_cents },
    ];
  }, [query.data]);

  function exportCsv() {
    if (!query.data) return;
    const d = query.data;
    const lines = [
      ["metric", "cents"],
      ["operating_balance_cents", d.current_state.operating_balance_cents],
      ["dip_balance_cents", d.current_state.dip_balance_cents],
      ["payroll_balance_cents", d.current_state.payroll_balance_cents],
      ["factoring_reserves_held_cents", d.current_state.factoring_reserves_held_cents],
      ["expected_ar_30d", d.next_30_days.expected_ar_collections_cents],
      ["expected_ap_30d", d.next_30_days.expected_ap_outflows_cents],
    ];
    const blob = new Blob([lines.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash-flow-overview-${asOf}.csv`;
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
        title="Cash flow overview"
        subtitle="Operating liquidity, 30-day projection, and treasury posture"
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print this page
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!query.data}>
              Export CSV
            </Button>
          </div>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      {query.isError ? <ReportBlockTPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {query.data ? (
        <>
          <div className="no-print">
            <label className="text-xs text-gray-600">
              As-of date
              <input
                type="date"
                className="mt-1 h-9 rounded border border-gray-300 px-2"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Operating balance</div>
              <div className="text-xl font-semibold">{money(query.data.current_state.operating_balance_cents)}</div>
              <div className="text-[11px] text-gray-500">Kind = operating (excl. payroll/DIP buckets)</div>
              <MiniSparkline values={kpiSpark} />
            </div>
            <div
              className={`rounded border bg-white p-3 ${query.data.current_state.dip_balance_cents > 0 && query.data.current_state.dip_balance_cents < DIP_ATTENTION_CENTS ? "border-2 border-[#C9A55F]" : "border-gray-200"}`}
            >
              <div className="text-[11px] font-semibold uppercase text-gray-500">DIP balance</div>
              <div className="text-xl font-semibold">{money(query.data.current_state.dip_balance_cents)}</div>
              <div className="text-[11px] text-gray-500">Gold border when DIP balance is low</div>
            </div>
            <div
              className={`rounded border bg-white p-3 ${query.data.current_state.payroll_balance_cents < PAYROLL_ALERT_CENTS ? "border-2 border-[#DC3545]" : "border-gray-200"}`}
            >
              <div className="text-[11px] font-semibold uppercase text-gray-500">Payroll balance</div>
              <div className="text-xl font-semibold">{money(query.data.current_state.payroll_balance_cents)}</div>
              <div className="text-[11px] text-gray-500">Alert when below {money(PAYROLL_ALERT_CENTS)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Factoring reserves held</div>
              <div className="text-xl font-semibold">{money(query.data.current_state.factoring_reserves_held_cents)}</div>
              <div className="text-[11px] text-gray-500">
                Funded MTD: {money(query.data.current_state.factoring_advances_funded_mtd_cents)}
              </div>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold">30-day projected combined balance</div>
            <div className="text-xs text-gray-500 mb-2">
              Straight-line blend of net projected change (±10% shaded band). Tooltip shows cumulative AR/AP/settlement
              portions by day.
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projection} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => money(Number(v))} width={72} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [money(value), name]}
                    labelFormatter={(l) => String(l)}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="rounded border border-gray-200 bg-white p-2 text-xs shadow">
                          <div className="font-semibold">{label}</div>
                          {payload.map((p) => (
                            <div key={String(p.dataKey)}>
                              {p.name}: {money(Number(p.value))}
                            </div>
                          ))}
                          <div className="mt-1 border-t border-gray-100 pt-1 text-gray-600">
                            <div>AR (cum.): {money(Number((payload[0]?.payload as { arPortion?: number })?.arPortion))}</div>
                            <div>AP (cum.): {money(Number((payload[0]?.payload as { apPortion?: number })?.apPortion))}</div>
                            <div>Settlements (cum.): {money(Number((payload[0]?.payload as { settlePortion?: number })?.settlePortion))}</div>
                          </div>
                        </div>
                      ) : null
                    }
                  />
                  <Area type="monotone" dataKey="balanceHigh" stroke="none" fill="#93c5fd" fillOpacity={0.25} name="Upper band" />
                  <Area type="monotone" dataKey="balanceLow" stroke="none" fill="#93c5fd" fillOpacity={0.25} name="Lower band" />
                  <Line type="monotone" dataKey="balance" stroke="#1d4ed8" name="Combined balance" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-2 text-sm font-semibold">Last 7 days — inflows vs outflows</div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bar7}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => money(Number(v))} width={68} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => money(Number(v))} />
                    <Bar dataKey="v" fill="#0d9488" name="Amount" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-2 text-sm font-semibold">Last 30 days — avg daily flow</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500">Avg daily inflow</div>
                  <div className="text-lg font-semibold">{money(query.data.historical.last_30_days_avg_daily_inflow_cents)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Avg daily outflow</div>
                  <div className="text-lg font-semibold">{money(query.data.historical.last_30_days_avg_daily_outflow_cents)}</div>
                </div>
              </div>
            </div>
          </div>

          <details className="no-print rounded border border-gray-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold">Alerts & follow-ups</summary>
            <ul className="mt-2 list-inside list-disc space-y-2 text-sm text-gray-700">
              <li>
                Uncategorized transactions:{" "}
                <strong>{query.data.current_state.uncategorized_transactions_count}</strong> —{" "}
                <Link className="text-blue-700 underline" to="/banking/categorization-rules">
                  Open categorization
                </Link>
              </li>
              <li>
                Open chargebacks: <strong>{money(query.data.current_state.chargebacks_open_cents)}</strong> —{" "}
                <Link className="text-blue-700 underline" to="/accounting/dispute-queue">
                  Open dispute queue
                </Link>
              </li>
            </ul>
          </details>
        </>
      ) : null}
    </div>
  );
}
