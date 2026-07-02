/**
 * ReserveTracker — FARO Escrow / Reserve Tracker.
 * Spec: FACTORING-PACKET-AUTO-ASSEMBLY.md §Factoring Reserve Tracker
 *
 * Shows per FARO account:
 *   - Total invoices submitted (count + $)
 *   - Total advances received ($)
 *   - Total reserve held / Faro Escrow balance ($)
 *   - Total fees paid YTD ($)
 *   - Chargebacks pending ($)
 *   - Estimated reserve release schedule (7/14/30/60-day forecast)
 *
 * All data from existing reserve/factoring APIs — no new financial code.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFactoringSummary,
  getFactoringChargebacksFees,
  getReserveBalances,
  getReserveBalanceHistory,
  getReserveReleaseForecast,
  listFactors,
  listFactoringBatches,
} from "../../api/factoring";
import { useCompanyContext } from "../../contexts/CompanyContext";

// ─── helpers ──────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtM = (cents: number) => money.format((Number(cents) || 0) / 100);
const fmtD = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};
const fmtDt = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3 text-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-gray-900">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-gray-500">{sub}</div> : null}
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export function ReserveTracker() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [selectedFactorId, setSelectedFactorId] = useState("");
  const [histPage, setHistPage] = useState(0);
  const PAGE_SIZE = 20;

  // factors
  const factorsQ = useQuery({
    queryKey: ["factoring", "factors", "all", companyId],
    queryFn: () => listFactors(companyId, { active_only: false }).then((r) => r.factors),
    enabled: Boolean(companyId),
  });

  // summary (submitted count, reserve balance, chargeback balance)
  const summaryQ = useQuery({
    queryKey: ["factoring", "summary", companyId],
    queryFn: () => getFactoringSummary(companyId),
    enabled: Boolean(companyId),
  });

  // reserve balances per factor
  const balancesQ = useQuery({
    queryKey: ["factoring", "reserves", "balances", companyId],
    queryFn: () => getReserveBalances(companyId).then((r) => r.balances),
    enabled: Boolean(companyId),
  });

  // chargebacks & fees (YTD)
  const chargebacksQ = useQuery({
    queryKey: ["factoring", "chargebacks-fees", companyId],
    queryFn: () => getFactoringChargebacksFees(companyId),
    enabled: Boolean(companyId),
  });

  // funded/submitted batch list for total submitted count + face value
  const batchesSubmittedQ = useQuery({
    queryKey: ["factoring", "batches", companyId, "submitted"],
    queryFn: () => listFactoringBatches(companyId, "submitted"),
    enabled: Boolean(companyId),
  });
  const batchesFundedQ = useQuery({
    queryKey: ["factoring", "batches", companyId, "funded"],
    queryFn: () => listFactoringBatches(companyId, "funded"),
    enabled: Boolean(companyId),
  });

  // reserve history for selected factor
  const historyQ = useQuery({
    queryKey: ["factoring", "reserves", "history", companyId, selectedFactorId, histPage, PAGE_SIZE],
    queryFn: () =>
      getReserveBalanceHistory(selectedFactorId, companyId, {
        limit: PAGE_SIZE,
        offset: histPage * PAGE_SIZE,
      }),
    enabled: Boolean(companyId && selectedFactorId),
  });

  // forecasts
  const fc7 = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 7],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 7),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const fc14 = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 14],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 14),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const fc30 = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 30],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 30),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const fc60 = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 60],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 60),
    enabled: Boolean(companyId && selectedFactorId),
  });

  // default to first factor with a balance
  useEffect(() => {
    if (selectedFactorId) return;
    const first =
      (balancesQ.data ?? [])[0]?.factor_id ?? (factorsQ.data ?? [])[0]?.id ?? "";
    if (first) setSelectedFactorId(first);
  }, [balancesQ.data, factorsQ.data, selectedFactorId]);

  useEffect(() => setHistPage(0), [selectedFactorId]);

  // ── computed KPIs ────────────────────────────────────────────────────────────

  const factorNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of factorsQ.data ?? []) m.set(f.id, f.name);
    return m;
  }, [factorsQ.data]);

  const totalSubmittedFace = useMemo(() => {
    const submitted = (batchesSubmittedQ.data?.batches ?? []).reduce(
      (acc, b) => acc + b.total_face_cents,
      0,
    );
    const funded = (batchesFundedQ.data?.batches ?? []).reduce(
      (acc, b) => acc + b.total_face_cents,
      0,
    );
    return submitted + funded;
  }, [batchesSubmittedQ.data, batchesFundedQ.data]);

  const totalSubmittedCount =
    (batchesSubmittedQ.data?.batches.length ?? 0) + (batchesFundedQ.data?.batches.length ?? 0);

  const totalReserveHeld = useMemo(
    () => (balancesQ.data ?? []).reduce((acc, b) => acc + b.balance_cents, 0),
    [balancesQ.data],
  );

  const totalAdvances = useMemo(
    () => (batchesFundedQ.data?.batches ?? []).reduce((acc, b) => acc + b.expected_advance_cents, 0),
    [batchesFundedQ.data],
  );

  const totalFeesYtd = useMemo(
    () =>
      (chargebacksQ.data?.monthly_summary ?? []).reduce(
        (acc, row) => acc + (Number(row.factor_fee_total) || 0),
        0,
      ),
    [chargebacksQ.data],
  );

  const chargebacksPending = Number(summaryQ.data?.chargeback_balance ?? 0);

  const totalHistPages = Math.max(1, Math.ceil((historyQ.data?.total ?? 0) / PAGE_SIZE));

  const forecastByWindow = {
    7: fc7.data?.total_projected_release_cents ?? 0,
    14: fc14.data?.total_projected_release_cents ?? 0,
    30: fc30.data?.total_projected_release_cents ?? 0,
    60: fc60.data?.total_projected_release_cents ?? 0,
  } as Record<7 | 14 | 30 | 60, number>;

  if (!companyId) {
    return (
      <div className="rounded border bg-white p-4 text-sm text-gray-500">
        Select an operating company to view the reserve tracker.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="faro-reserve-tracker">
      {/* KPI strip */}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Submitted (batches)"
          value={String(totalSubmittedCount)}
          sub={fmtM(totalSubmittedFace) + " face"}
        />
        <KpiCard
          label="Advances Received"
          value={fmtM(totalAdvances)}
          sub={`${batchesFundedQ.data?.batches.length ?? 0} funded`}
        />
        <KpiCard
          label="FARO Reserve Held"
          value={fmtM(totalReserveHeld)}
          sub={`across ${(balancesQ.data ?? []).length} factor(s)`}
        />
        <KpiCard label="Fees Paid YTD" value={fmtM(totalFeesYtd)} />
        <KpiCard
          label="Chargebacks Pending"
          value={fmtM(chargebacksPending)}
          sub={chargebacksPending > 0 ? "review needed" : "none"}
        />
        <KpiCard
          label="Active Factor"
          value={summaryQ.data?.active_factor_name ?? "—"}
          sub={`${summaryQ.data?.recourse_days ?? 90}-day recourse`}
        />
      </div>

      {/* Release forecast */}
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-800">Estimated Reserve Release Schedule</div>
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={selectedFactorId}
            onChange={(e) => setSelectedFactorId(e.target.value)}
          >
            <option value="">— all factors —</option>
            {(factorsQ.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Forecast windows */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([7, 14, 30, 60] as const).map((days) => (
            <div key={days} className="rounded border border-gray-200 bg-gray-50 p-2 text-center">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Next {days}d</div>
              <div className="mt-1 text-base font-bold text-gray-900">
                {fmtM(forecastByWindow[days])}
              </div>
            </div>
          ))}
        </div>

        {/* Forecast schedule table */}
        <div className="max-h-56 overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-2">Release Date</th>
                <th className="px-2 py-2 text-right">Projected Amount</th>
                <th className="px-2 py-2 text-right">Source Movements</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(fc60.data?.schedule ?? []).map((row) => (
                <tr key={`${row.release_date}-${row.source_movement_count}`}>
                  <td className="px-2 py-2">{fmtD(row.release_date)}</td>
                  <td className="px-2 py-2 text-right font-medium text-emerald-700">
                    {fmtM(row.projected_release_cents)}
                  </td>
                  <td className="px-2 py-2 text-right">{row.source_movement_count}</td>
                </tr>
              ))}
              {(fc60.data?.schedule ?? []).length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-center text-gray-500" colSpan={3}>
                    {fc60.isLoading ? "Calculating…" : "No projected releases in the next 60 days."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-factor reserve balances */}
      {(balancesQ.data ?? []).length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(balancesQ.data ?? []).map((bal) => (
            <div
              key={bal.factor_id}
              className={`cursor-pointer rounded border p-3 text-sm transition-colors ${
                selectedFactorId === bal.factor_id
                  ? "border-slate-300 bg-slate-100"
                  : "border-gray-200 bg-white hover:border-slate-300"
              }`}
              onClick={() => setSelectedFactorId(bal.factor_id)}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {factorNameById.get(bal.factor_id) ?? bal.factor_id.slice(0, 8)}
              </div>
              <div className="mt-1 text-xl font-bold text-gray-900">{fmtM(bal.balance_cents)}</div>
              <div className="mt-1 text-[11px] text-gray-500">
                Last movement: {fmtDt(bal.last_movement_at)}
              </div>
              <div className="text-[11px] text-gray-500">
                Total movements: {bal.movement_count}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Reserve balance history table */}
      {selectedFactorId ? (
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">
            Reserve Movement History — {factorNameById.get(selectedFactorId) ?? selectedFactorId.slice(0, 8)}
          </div>
          <div className="max-h-64 overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2 text-right">Movement</th>
                  <th className="px-2 py-2 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(historyQ.data?.movements ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-2">{fmtDt(row.created_at)}</td>
                    <td className="px-2 py-2">{row.reason}</td>
                    <td
                      className={`px-2 py-2 text-right font-medium ${
                        row.signed_amount_cents >= 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {fmtM(row.signed_amount_cents)}
                    </td>
                    <td className="px-2 py-2 text-right">{fmtM(row.running_balance_cents)}</td>
                  </tr>
                ))}
                {(historyQ.data?.movements ?? []).length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-center text-gray-500" colSpan={4}>
                      {historyQ.isLoading ? "Loading…" : "No movements recorded for this factor."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              Page {Math.min(histPage + 1, totalHistPages)} of {totalHistPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
                onClick={() => setHistPage((p) => Math.max(0, p - 1))}
                disabled={histPage <= 0}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
                onClick={() => setHistPage((p) => Math.min(totalHistPages - 1, p + 1))}
                disabled={histPage >= totalHistPages - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Chargebacks pending detail */}
      {(chargebacksQ.data?.history ?? []).length > 0 ? (
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">Chargeback + Fee History</div>
          <div className="max-h-48 overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Statement</th>
                  <th className="px-2 py-2 text-right">Chargeback</th>
                  <th className="px-2 py-2 text-right">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(chargebacksQ.data?.history ?? []).slice(0, 50).map((row) => (
                  <tr key={row.factoring_advance_id + row.created_at}>
                    <td className="px-2 py-2">{fmtD(row.created_at)}</td>
                    <td className="px-2 py-2">{row.statement_reference ?? "—"}</td>
                    <td className="px-2 py-2 text-right text-red-700">
                      {row.chargeback_amount > 0 ? fmtM(row.chargeback_amount) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {row.factor_fee_amount > 0 ? fmtM(row.factor_fee_amount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
