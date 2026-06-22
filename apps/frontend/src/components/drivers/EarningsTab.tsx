import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import { getDebtSummary, listSettlements, type SettlementListRow } from "../../api/driverFinance";
import { getLiabilitiesByDriver } from "../../api/liabilities";
import { Button } from "../Button";
import { useLiveDebt } from "../../pages/driver-finance/hooks/useLiveDebt";

type Props = {
  driverId: string;
  operatingCompanyId: string;
};

function money(value: number) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function sumBalances(rows: Array<Record<string, unknown>>) {
  return rows.reduce((sum, row) => sum + Number(row.current_balance ?? 0), 0);
}

function weeksElapsedInYear(now = new Date()) {
  const start = new Date(now.getFullYear(), 0, 1);
  const ms = now.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

function isYtdSettlement(row: SettlementListRow, year: number) {
  const end = new Date(row.period_end);
  return !Number.isNaN(end.getTime()) && end.getFullYear() === year;
}

export function EarningsTab({ driverId, operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const enabled = Boolean(driverId) && Boolean(operatingCompanyId);
  const { debt, computedAt, loading: debtLoading, refresh } = useLiveDebt(
    enabled ? driverId : null,
    enabled ? operatingCompanyId : null
  );

  const liabilitiesQuery = useQuery({
    queryKey: ["driver-liabilities", driverId, operatingCompanyId],
    queryFn: () => getLiabilitiesByDriver(driverId, operatingCompanyId),
    enabled,
  });

  const settlementsQuery = useQuery({
    queryKey: ["driver-settlements-summary", operatingCompanyId],
    queryFn: () => listSettlements(operatingCompanyId),
    enabled,
  });

  const cashAdvancesQuery = useQuery({
    queryKey: ["driver-cash-advances", operatingCompanyId, driverId],
    queryFn: () => cashAdvanceRequestsOfficeApi.list(operatingCompanyId, "approved"),
    enabled,
  });

  const liabilities = liabilitiesQuery.data?.liabilities ?? [];
  const driverSettlements = useMemo(() => {
    const rows = settlementsQuery.data?.settlements ?? [];
    return rows
      .filter((row) => row.driver_id === driverId)
      .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)));
  }, [driverId, settlementsQuery.data?.settlements]);

  const ytdYear = new Date().getFullYear();
  const ytdSettlements = driverSettlements.filter((row) => isYtdSettlement(row, ytdYear));
  const ytdEarnings = ytdSettlements.reduce((sum, row) => sum + Number(row.gross_pay ?? 0), 0);
  const lastFourSettlements = driverSettlements.slice(0, 4);
  const averagePerWeek = ytdEarnings / weeksElapsedInYear();

  const totalOutstandingLiabilities = sumBalances(liabilities);
  const cashAdvancesUnpaid = liabilities
    .filter((row) => String(row.type ?? "") === "advance")
    .reduce((sum, row) => sum + Number(row.current_balance ?? 0), 0);

  const approvedAdvancesForDriver = (cashAdvancesQuery.data?.requests ?? []).filter(
    (row) => String(row.driver_id ?? "") === driverId
  );

  const handleRefresh = async () => {
    await refresh();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["driver-liabilities", driverId, operatingCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["driver-settlements-summary", operatingCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["driver-cash-advances", operatingCompanyId, driverId] }),
    ]);
    await getDebtSummary(driverId, operatingCompanyId);
  };

  if (!enabled) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view earnings and debt.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="driver-earnings-debt-tab">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white p-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Live debt summary</h2>
          <div className="text-xs text-gray-500">
            Recomputed at {computedAt ? new Date(computedAt).toLocaleString() : "—"}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={debtLoading}
          onClick={() => void handleRefresh()}
          data-testid="driver-earnings-debt-refresh"
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <div className="text-[11px] uppercase text-red-700">Total active debt</div>
          <div className="text-lg font-semibold text-red-800" data-testid="driver-earnings-total-debt">
            {money(Number(debt?.total_active_debt ?? 0))}
          </div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <div className="text-[11px] uppercase text-amber-700">Outstanding liabilities</div>
          <div className="text-lg font-semibold text-amber-900" data-testid="driver-earnings-liabilities-total">
            {money(totalOutstandingLiabilities)}
          </div>
        </div>
        <div className="rounded border border-slate-300 bg-slate-100 p-3">
          <div className="text-[11px] uppercase text-slate-700">Cash advances unpaid</div>
          <div className="text-lg font-semibold text-slate-700" data-testid="driver-earnings-cash-advances-unpaid">
            {money(cashAdvancesUnpaid)}
          </div>
          <div className="text-[10px] text-slate-700">{approvedAdvancesForDriver.length} approved advance(s)</div>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[11px] uppercase text-emerald-700">Pending ack liabilities</div>
          <div className="text-lg font-semibold text-emerald-900">
            {money(Number(debt?.pending_ack_total ?? 0))}
          </div>
          <div className="text-[10px] text-emerald-700">{Number(debt?.pending_ack_count ?? 0)} pending</div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-[11px] uppercase text-gray-500">YTD earnings</div>
          <div className="text-lg font-semibold text-gray-900" data-testid="driver-earnings-ytd">
            {money(ytdEarnings)}
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-[11px] uppercase text-gray-500">Average per week</div>
          <div className="text-lg font-semibold text-gray-900" data-testid="driver-earnings-avg-week">
            {money(averagePerWeek)}
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-[11px] uppercase text-gray-500">Settlements YTD</div>
          <div className="text-lg font-semibold text-gray-900">{ytdSettlements.length}</div>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Last 4 settlements</h3>
          <Link
            to={`/driver-finance/settlements?driver_id=${encodeURIComponent(driverId)}`}
            className="text-xs text-slate-700 underline"
            data-testid="driver-earnings-settlements-link"
          >
            View all settlements →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
              <tr>
                {["Period", "Gross", "Deductions", "Net pay", "Status"].map((heading) => (
                  <th key={heading} className="px-2 py-1">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lastFourSettlements.map((row) => (
                <tr key={row.id} className="border-t border-gray-100" data-testid={`driver-earnings-settlement-${row.id}`}>
                  <td className="px-2 py-1">
                    {row.period_start} → {row.period_end}
                  </td>
                  <td className="px-2 py-1">{money(Number(row.gross_pay ?? 0))}</td>
                  <td className="px-2 py-1">{money(Number(row.deductions_total ?? 0))}</td>
                  <td className="px-2 py-1 font-semibold text-green-700">{money(Number(row.net_pay ?? 0))}</td>
                  <td className="px-2 py-1">{row.status}</td>
                </tr>
              ))}
              {lastFourSettlements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-center text-gray-500">
                    No settlements for this driver yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Active liabilities</h3>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
              <tr>
                {["Type", "Source", "Original", "Paid", "Balance", "Status"].map((heading) => (
                  <th key={heading} className="px-2 py-1">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liabilities.map((row) => (
                <tr key={String(row.id)} className="border-t border-gray-100" data-testid={`driver-earnings-liability-${String(row.id)}`}>
                  <td className="px-2 py-1">{String(row.type ?? "—")}</td>
                  <td className="px-2 py-1">{String(row.source_description ?? "—")}</td>
                  <td className="px-2 py-1">{money(Number(row.original_amount ?? 0))}</td>
                  <td className="px-2 py-1">{money(Number(row.paid_to_date ?? 0))}</td>
                  <td className="px-2 py-1 font-semibold">{money(Number(row.current_balance ?? 0))}</td>
                  <td className="px-2 py-1">{String(row.display_status ?? row.status ?? "active")}</td>
                </tr>
              ))}
              {liabilities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-3 text-center text-gray-500">
                    No active liabilities for this driver.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ARCHIVE (A24-5): prior placeholder copy lived inline in DriverDetail.tsx — Sunset 2026-09-01 */}
    </div>
  );
}
