import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  getBankingRegister,
  getEscrowDriverBalances,
  getEscrowDriverTimeline,
  type EscrowDriverTimelineRow,
} from "../../../api/banking";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { formatDateUS } from "../../../lib/formatDate";
import { RegisterToolbar } from "./RegisterToolbar";
import { useListState } from "../../../components/list-state";

const ESCROW_VIRTUAL_ACCOUNT_ID = "00000000-0000-0000-0000-000000000056";

type Props = {
  operatingCompanyId: string;
  driverEscrowBalance: number;
};

function timelineToRegisterRow(row: EscrowDriverTimelineRow): Record<string, unknown> {
  const amount = Number(row.amount ?? 0);
  return {
    id: row.id,
    txn_date: String(row.created_at ?? "").slice(0, 10),
    description: row.memo ?? row.entry_type ?? "Escrow movement",
    amount,
    deposits: amount >= 0 ? amount : 0,
    withdrawals: amount < 0 ? Math.abs(amount) : 0,
    balance: 0,
    status: "synced",
    category: row.bucket ?? row.entry_type ?? "escrow",
    // Doc-18 defect #12 — carry the driver forward so the row is clickable (drill to the driver profile).
    driver_id: row.driver_id ?? "",
  };
}

function registerToEscrowRow(row: Record<string, unknown>): Record<string, unknown> {
  const amount = Number(row.amount ?? 0);
  return {
    id: String(row.id ?? ""),
    txn_date: String(row.txn_date ?? ""),
    description: String(row.description ?? "Escrow movement"),
    amount,
    deposits: amount >= 0 ? amount : 0,
    withdrawals: amount < 0 ? Math.abs(amount) : 0,
    balance: 0,
    status: String(row.status ?? "synced"),
    category: String(row.category ?? "escrow"),
    // Doc-18 defect #12 — the account-level register now surfaces driver_id (banking.routes.ts fix),
    // so a row can drill through to the driver even in the "All drivers" view.
    driver_id: String(row.driver_id ?? ""),
  };
}

export function DriverEscrowTabContent({ operatingCompanyId, driverEscrowBalance }: Props) {
  const navigate = useNavigate();
  const [selectedDriverId, setSelectedDriverId] = useState("");

  const driverBalancesQuery = useQuery({
    queryKey: ["banking", "escrow", "drivers", operatingCompanyId],
    queryFn: () => getEscrowDriverBalances(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const accountLedgerQuery = useQuery({
    queryKey: ["banking", "escrow", "register", operatingCompanyId],
    queryFn: () => getBankingRegister(ESCROW_VIRTUAL_ACCOUNT_ID, operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const driverTimelineQuery = useQuery({
    queryKey: ["banking", "escrow", "driver-timeline", operatingCompanyId, selectedDriverId],
    queryFn: () => getEscrowDriverTimeline(operatingCompanyId, selectedDriverId),
    enabled: Boolean(operatingCompanyId && selectedDriverId),
  });

  const driverRows = driverBalancesQuery.data?.drivers ?? [];
  const selectedDriver = driverRows.find((row) => row.driver_id === selectedDriverId) ?? null;
  const supportsPerDriverBreakdown = driverBalancesQuery.isSuccess;

  const tableRows = useMemo(() => {
    if (selectedDriverId) {
      return (driverTimelineQuery.data?.timeline ?? []).map(timelineToRegisterRow);
    }
    return (accountLedgerQuery.data?.register_rows ?? []).map(registerToEscrowRow);
  }, [accountLedgerQuery.data?.register_rows, driverTimelineQuery.data?.timeline, selectedDriverId]);

  // The empty message renders only once the ledger/timeline query feeding the table settles.
  const escrowLedgerQuery = selectedDriverId ? driverTimelineQuery : accountLedgerQuery;
  const listState = useListState(escrowLedgerQuery, tableRows.length === 0);

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-sm border border-gray-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Escrow virtual account balance</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">${Number(driverEscrowBalance ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-sm border border-gray-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Driver balances available</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{driverRows.length}</p>
          </div>
          <div className="rounded-sm border border-gray-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Ledger scope</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {selectedDriver ? (
                <>
                  Driver: <Link to={`/drivers/${selectedDriver.driver_id}`} className="text-slate-700 hover:underline">{selectedDriver.driver_name ?? "Unknown"}</Link>
                </>
              ) : (
                "Account-level ledger"
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700">
            Driver filter
            <SelectCombobox
              value={selectedDriverId}
              onChange={(event) => setSelectedDriverId(event.target.value)}
              className="mt-1 rounded-sm border border-gray-300 px-2 py-1 text-sm"
              disabled={!supportsPerDriverBreakdown || driverRows.length === 0}
            >
              <option value="">All drivers (escrow account ledger)</option>
              {driverRows.map((driver) => (
                <option key={driver.driver_id} value={driver.driver_id}>
                  {driver.driver_name ?? "Unknown"} - ${Number(driver.escrow_balance ?? 0).toFixed(2)}
                </option>
              ))}
            </SelectCombobox>
          </label>
        </div>

        {!supportsPerDriverBreakdown ? (
          <div className="mb-3 rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">
            Per-driver escrow breakdown is unavailable from the current backend response. Showing account-level escrow ledger only.
          </div>
        ) : null}

        <RegisterToolbar
          rowCount={tableRows.length}
          onRefresh={() => {
            void accountLedgerQuery.refetch();
            void driverBalancesQuery.refetch();
            if (selectedDriverId) void driverTimelineQuery.refetch();
          }}
        />

        <div className="mt-2 overflow-x-auto rounded-sm border border-gray-200 bg-white">
          <table className="min-w-[1050px] w-full text-left">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
              <tr>
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Description</th>
                <th className="px-2 py-1">Deposits</th>
                <th className="px-2 py-1">Withdrawals</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Category</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                const rowDriverId = String(row.driver_id ?? "");
                // Doc-18 defect #12 — a register row must never be a dead click: drill through to the
                // driver the escrow movement belongs to (same target the "Ledger scope" driver link
                // above uses). Rows without a resolvable driver stay inert rather than faking a link.
                const openable = Boolean(rowDriverId);
                return (
                  <tr
                    key={String(row.id ?? "")}
                    className={`border-t border-gray-100 text-xs ${openable ? "cursor-pointer hover:bg-slate-50" : ""}`}
                    onClick={openable ? () => navigate(`/drivers/${rowDriverId}`) : undefined}
                  >
                    <td className="px-2 py-1">{formatDateUS(row.txn_date)}</td>
                    <td className="px-2 py-1">{String(row.description ?? "")}</td>
                    <td className="px-2 py-1 text-slate-700">
                      {Number(row.deposits ?? 0) > 0 ? `$${Number(row.deposits ?? 0).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1 text-red-700">
                      {Number(row.withdrawals ?? 0) > 0 ? `$${Number(row.withdrawals ?? 0).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1">{String(row.status ?? "synced")}</td>
                    <td className="px-2 py-1">{String(row.category ?? "escrow")}</td>
                  </tr>
                );
              })}
              {listState.isEmpty ? (
                <tr>
                  <td colSpan={6} className="px-2 py-3 text-center text-xs text-gray-500">
                    No escrow ledger rows found for this filter.
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
