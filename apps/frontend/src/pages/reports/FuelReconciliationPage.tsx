import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  getFuelReconciliation,
  rematchFuelTxnToGps,
  type FuelReconciliationFlag,
  type FuelReconciliationResponse,
  type FuelReconciliationTruckRow,
} from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { ReportBlockVPendingBanner } from "./ReportBlockVPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const FLAG_META: Record<FuelReconciliationFlag, { emoji: string; label: string }> = {
  over_reported: { emoji: "🚩", label: "over_reported" },
  under_reported: { emoji: "⚠️", label: "under_reported" },
  unmatched: { emoji: "❌", label: "unmatched" },
};

type SortKey = keyof FuelReconciliationTruckRow;

export function FuelReconciliationPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(defaultRange);
  const [applied, setApplied] = useState(defaultRange);
  const [sortKey, setSortKey] = useState<SortKey>("unit_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [tab, setTab] = useState<"card" | "wo">("card");
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchNote, setMatchNote] = useState("");

  const query = useQuery({
    queryKey: ["reports", "fuel-reconciliation", companyId, applied.start, applied.end],
    queryFn: () =>
      getFuelReconciliation({
        operating_company_id: companyId,
        period_start: applied.start,
        period_end: applied.end,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const sorted = useMemo(() => {
    const rows = query.data?.by_truck ?? [];
    const mul = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "unit_number") return a.unit_number.localeCompare(b.unit_number) * mul;
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return (av - bv) * mul;
    });
    return copy;
  }, [query.data?.by_truck, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function exportCsv(data: FuelReconciliationResponse) {
    const h = ["Unit", "Card", "WO", "Delta", "MatchedPct", "Flags"];
    const lines = (data.by_truck ?? []).map((r) =>
      [r.unit_number, r.card_amount_cents, r.wo_amount_cents, r.delta_cents, r.matched_pct, r.flags.join("|")].join(","),
    );
    const blob = new Blob([[h.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fuel-reconciliation-${applied.start}-${applied.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <ReportsSubNav />
      <PageHeader
        title="Fuel reconciliation"
        subtitle="Card spend vs work order fuel attribution"
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
      {query.isError ? <ReportBlockVPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}

      <div className="no-print flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          From
          <input type="date" className="mt-1 block h-9 rounded border px-2" value={period.start} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))} />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input type="date" className="mt-1 block h-9 rounded border px-2" value={period.end} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))} />
        </label>
        <Button size="sm" onClick={() => setApplied({ ...period })}>
          Apply
        </Button>
      </div>

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {query.data ? (
        <>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
            {(
              [
                ["Card amount", money(query.data.totals.card_amount_cents)],
                ["WO amount", money(query.data.totals.wo_amount_cents)],
                ["Delta", money(query.data.totals.delta_cents)],
                ["Match rate", `${query.data.totals.match_rate_pct.toFixed(1)}%`],
                ["Unmatched", String(query.data.totals.unmatched_count)],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded border border-gray-200 bg-white p-3">
                <div className="text-[11px] font-semibold uppercase text-gray-500">{k}</div>
                <div className="text-lg font-semibold">{v}</div>
              </div>
            ))}
          </div>

          <div className="overflow-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                <tr>
                  <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("unit_number")}>
                    Unit #
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("card_amount_cents")}>
                    Card $
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("wo_amount_cents")}>
                    WO $
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("delta_cents")}>
                    Delta
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("matched_pct")}>
                    Matched %
                  </th>
                  <th className="px-2 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const suspicious = r.card_amount_cents > 0 && Math.abs(r.delta_cents) / r.card_amount_cents > 0.1;
                  return (
                    <tr
                      key={r.unit_id}
                      className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${suspicious ? "bg-red-50" : ""}`}
                      onClick={() => navigate(`/fleet/units/${r.unit_id}?tab=financial`)}
                    >
                      <td className="px-2 py-2 font-medium">{r.unit_number}</td>
                      <td className="px-2 py-2 text-right">{money(r.card_amount_cents)}</td>
                      <td className="px-2 py-2 text-right">{money(r.wo_amount_cents)}</td>
                      <td className="px-2 py-2 text-right">{money(r.delta_cents)}</td>
                      <td className="px-2 py-2 text-right">{r.matched_pct.toFixed(0)}%</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(r.flags ?? []).map((f) => (
                            <span key={f} className="rounded border border-gray-200 px-1 py-0.5 text-[10px] font-semibold" title={FLAG_META[f].label}>
                              {FLAG_META[f].emoji} {FLAG_META[f].label}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="no-print mb-2 flex gap-2 border-b border-gray-100 pb-2">
              <button type="button" className={`text-sm font-semibold ${tab === "card" ? "text-blue-700" : "text-gray-500"}`} onClick={() => setTab("card")}>
                Unmatched Card Transactions
              </button>
              <button type="button" className={`text-sm font-semibold ${tab === "wo" ? "text-blue-700" : "text-gray-500"}`} onClick={() => setTab("wo")}>
                Unmatched WO Entries
              </button>
            </div>
            {tab === "card" ? (
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="text-[11px] text-gray-500">
                    <th className="py-1">Date</th>
                    <th className="py-1">Amount</th>
                    <th className="py-1">Merchant</th>
                    <th className="py-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data.unmatched_card_transactions ?? []).map((row) => (
                    <tr key={row.transaction_id} className="border-t border-gray-100">
                      <td className="py-1">{row.transaction_date}</td>
                      <td className="py-1">{money(row.amount_cents)}</td>
                      <td className="py-1">
                        <div>{row.merchant_name ?? row.description ?? "—"}</div>
                        <div className="mt-0.5 text-[10px]">
                          {row.gps_match_confidence === "high" ? (
                            <span className="rounded bg-emerald-100 px-1 text-emerald-700">GPS match: high</span>
                          ) : row.gps_match_confidence === "medium" ? (
                            <span className="rounded bg-amber-100 px-1 text-amber-700">GPS match: medium</span>
                          ) : row.gps_match_confidence === "no_match" ? (
                            <span className="rounded bg-red-100 px-1 text-red-700">GPS match: no match</span>
                          ) : (
                            <span className="rounded bg-gray-100 px-1 text-gray-600">GPS match: pending</span>
                          )}
                        </div>
                      </td>
                      <td className="py-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (!companyId) return;
                            void rematchFuelTxnToGps({
                              operating_company_id: companyId,
                              transaction_id: row.transaction_id,
                            })
                              .then(() => {
                                pushToast("GPS re-match queued", "success");
                                void queryClient.invalidateQueries({ queryKey: ["reports", "fuel-reconciliation", companyId] });
                              })
                              .catch((error: Error) => pushToast(error.message || "Failed to re-match GPS", "error"));
                          }}
                        >
                          Re-match GPS
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="text-[11px] text-gray-500">
                    <th className="py-1">WO#</th>
                    <th className="py-1">Date</th>
                    <th className="py-1">Amount</th>
                    <th className="py-1">Unit</th>
                    <th className="py-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data.unmatched_wo_entries ?? []).map((row) => (
                    <tr key={row.wo_id} className="border-t border-gray-100">
                      <td className="py-1">{row.wo_number}</td>
                      <td className="py-1">{row.wo_date}</td>
                      <td className="py-1">{money(row.amount_cents)}</td>
                      <td className="py-1">{row.unit_number}</td>
                      <td className="py-1">
                        <Button size="sm" variant="secondary" onClick={() => setMatchOpen(true)}>
                          Manual Match
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      <Modal open={matchOpen} onClose={() => setMatchOpen(false)} title="Manual match (link)">
        <p className="text-sm text-gray-600">Pair a card line to a WO entry. Full matcher UI ships with Block V data services.</p>
        <label className="mt-2 block text-xs text-gray-600">
          Notes
          <textarea className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" rows={3} value={matchNote} onChange={(e) => setMatchNote(e.target.value)} />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setMatchOpen(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              setMatchOpen(false);
              setMatchNote("");
            }}
          >
            Save link
          </Button>
        </div>
      </Modal>
    </div>
  );
}
