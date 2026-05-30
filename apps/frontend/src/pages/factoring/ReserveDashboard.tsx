import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getReserveBalanceHistory,
  getReserveBalances,
  getReserveReleaseForecast,
  listFactors,
} from "../../api/factoring";
import { useCompanyContext } from "../../contexts/CompanyContext";

const LOOKAHEAD_WINDOWS = [7, 14, 30, 60] as const;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function asMoney(cents: number) {
  return money.format((Number(cents) || 0) / 100);
}

function asDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function asDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export function ReserveDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [selectedFactorId, setSelectedFactorId] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const factorsQuery = useQuery({
    queryKey: ["factoring", "factors", "all", companyId],
    queryFn: () => listFactors(companyId, { active_only: false }).then((res) => res.factors),
    enabled: Boolean(companyId),
  });

  const balancesQuery = useQuery({
    queryKey: ["factoring", "reserves", "balances", companyId],
    queryFn: () => getReserveBalances(companyId).then((res) => res.balances),
    enabled: Boolean(companyId),
  });

  const factorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const factor of factorsQuery.data ?? []) map.set(factor.id, factor.name);
    return map;
  }, [factorsQuery.data]);

  useEffect(() => {
    if (selectedFactorId) return;
    const firstBalance = balancesQuery.data?.[0]?.factor_id;
    const firstFactor = factorsQuery.data?.[0]?.id;
    const next = firstBalance ?? firstFactor ?? "";
    if (next) setSelectedFactorId(next);
  }, [balancesQuery.data, factorsQuery.data, selectedFactorId]);

  useEffect(() => {
    setPage(0);
  }, [selectedFactorId]);

  const historyQuery = useQuery({
    queryKey: ["factoring", "reserves", "history", companyId, selectedFactorId, page, pageSize],
    queryFn: () =>
      getReserveBalanceHistory(selectedFactorId, companyId, {
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled: Boolean(companyId && selectedFactorId),
  });

  const forecast7Query = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 7],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 7),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const forecast14Query = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 14],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 14),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const forecast30Query = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 30],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 30),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const forecast60Query = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 60],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 60),
    enabled: Boolean(companyId && selectedFactorId),
  });

  const totalPages = Math.max(1, Math.ceil((historyQuery.data?.total ?? 0) / pageSize));
  const forecastByWindow: Record<number, number> = {
    7: forecast7Query.data?.total_projected_release_cents ?? 0,
    14: forecast14Query.data?.total_projected_release_cents ?? 0,
    30: forecast30Query.data?.total_projected_release_cents ?? 0,
    60: forecast60Query.data?.total_projected_release_cents ?? 0,
  };

  return (
    <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Factor Filter</div>
          <select
            className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
            value={selectedFactorId}
            onChange={(event) => setSelectedFactorId(event.target.value)}
          >
            <option value="">Select factor</option>
            {(factorsQuery.data ?? []).map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {(balancesQuery.data ?? []).map((balance) => (
          <div key={balance.factor_id} className="rounded border border-gray-200 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">{factorNameById.get(balance.factor_id) ?? balance.factor_id}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{asMoney(balance.balance_cents)}</div>
            <div className="mt-1 text-xs text-gray-600">Last movement: {asDateTime(balance.last_movement_at)}</div>
            <div className="text-xs text-gray-600">Total movements: {balance.movement_count}</div>
          </div>
        ))}
        {(balancesQuery.data ?? []).length === 0 ? (
          <div className="rounded border border-dashed border-gray-300 p-3 text-sm text-gray-500">No reserve balances found.</div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-gray-200 p-3">
          <div className="mb-2 text-sm font-medium text-gray-900">Reserve Balance Over Time</div>
          <div className="max-h-72 overflow-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2 text-right">Signed Movement</th>
                  <th className="px-2 py-2 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(historyQuery.data?.movements ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-2">{asDateTime(row.created_at)}</td>
                    <td className={`px-2 py-2 text-right ${row.signed_amount_cents >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {asMoney(row.signed_amount_cents)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium">{asMoney(row.running_balance_cents)}</td>
                  </tr>
                ))}
                {(historyQuery.data?.movements ?? []).length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-gray-500" colSpan={3}>
                      {historyQuery.isLoading ? "Loading balance history..." : "No reserve movements found for the selected factor."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              Page {Math.min(page + 1, totalPages)} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page <= 0}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="rounded border border-gray-200 p-3">
          <div className="mb-2 text-sm font-medium text-gray-900">Forecast Releases (7/14/30/60)</div>
          <div className="grid gap-2 grid-cols-2">
            {LOOKAHEAD_WINDOWS.map((days) => (
              <div key={days} className="rounded border border-gray-200 p-2 text-sm">
                <div className="text-xs uppercase tracking-wide text-gray-500">Next {days} days</div>
                <div className="mt-1 font-semibold text-gray-900">{asMoney(forecastByWindow[days])}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 max-h-48 overflow-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-2">Release Date</th>
                  <th className="px-2 py-2 text-right">Projected</th>
                  <th className="px-2 py-2 text-right">Movements</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(forecast60Query.data?.schedule ?? []).map((row) => (
                  <tr key={`${row.release_date}-${row.source_movement_count}`}>
                    <td className="px-2 py-2">{asDate(row.release_date)}</td>
                    <td className="px-2 py-2 text-right">{asMoney(row.projected_release_cents)}</td>
                    <td className="px-2 py-2 text-right">{row.source_movement_count}</td>
                  </tr>
                ))}
                {(forecast60Query.data?.schedule ?? []).length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-gray-500" colSpan={3}>
                      {forecast60Query.isLoading ? "Calculating reserve release forecast..." : "No projected reserve releases in the selected window."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded border border-gray-200 p-3">
        <div className="mb-2 text-sm font-medium text-gray-900">Recent Movements</div>
        <div className="max-h-64 overflow-auto rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-2">Factor</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Reason</th>
                <th className="px-2 py-2 text-right">Direction</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(historyQuery.data?.movements ?? []).map((movement) => (
                <tr key={movement.id}>
                  <td className="px-2 py-2">{factorNameById.get(movement.factor_id ?? "") ?? "-"}</td>
                  <td className="px-2 py-2">{asDateTime(movement.created_at)}</td>
                  <td className="px-2 py-2">{movement.reason}</td>
                  <td className="px-2 py-2 text-right">{movement.direction}</td>
                  <td className="px-2 py-2 text-right">{asMoney(movement.amount_cents)}</td>
                </tr>
              ))}
              {(historyQuery.data?.movements ?? []).length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-gray-500" colSpan={5}>
                    No recent movements for this factor.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
