import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getBankingRegister,
  getEscrowDriverBalances,
  getEscrowDriverTimeline,
  type EscrowDriverTimelineRow,
} from "../../../api/banking";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";
import { RegisterToolbar } from "./RegisterToolbar";
import { useListState } from "../../../components/list-state";

const ESCROW_VIRTUAL_ACCOUNT_ID = "00000000-0000-0000-0000-000000000056";

type EscrowLedgerRow = Record<string, unknown>;

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
    settlement_id: row.settlement_id ?? "",
    settlement_line_id: row.settlement_line_id ?? "",
    journal_entry_id: row.journal_entry_id ?? "",
    journal_entry_date: row.journal_entry_date ?? "",
    journal_entry_memo: row.journal_entry_memo ?? "",
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
    settlement_id: String(row.settlement_id ?? ""),
    settlement_line_id: String(row.settlement_line_id ?? ""),
    // BANK-F6050 — register SELECT already returns settlement_display_id + JE fields (BANK-F5751);
    // dropping them here made EntityLink call entityLabel("", uuid) → "Settlement — not visible"
    // on live rows whose description already named S-20260802-0258 / S-2026-0002.
    settlement_display_id: String(row.settlement_display_id ?? ""),
    journal_entry_id: String(row.journal_entry_id ?? ""),
    journal_entry_memo: String(row.journal_entry_memo ?? ""),
  };
}

export function DriverEscrowTabContent({ operatingCompanyId, driverEscrowBalance }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // LINK-F5171/LINK-F5177 — reverse_link deep-link: EscrowHistoryView → ?driver_id=.
  // LST-F5163P — EntityPicker (not SelectCombobox of balance rows) is reverse chrome.
  const [selectedDriverId, setSelectedDriverIdState] = useState(() => searchParams.get("driver_id") ?? "");
  const setSelectedDriverId = (driverId: string) => {
    setSelectedDriverIdState(driverId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (driverId) next.set("driver_id", driverId);
        else next.delete("driver_id");
        return next;
      },
      { replace: true }
    );
  };

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

  // Display-only ParityTable migration: column order (Date / Description / Deposits / Withdrawals /
  // Status / Category), amount formatting ($X.XX with em-dash for zero), sign handling (deposits
  // slate, withdrawals red), and the Doc-18 defect #12 driver drill-through are preserved 1:1 from
  // the former hand-rolled table markup.
  const columns = useMemo<ParityColumn<EscrowLedgerRow>[]>(
    () => [
      { key: "txn_date", label: "Date", render: (row) => formatDateUS(row.txn_date) },
      { key: "description", label: "Description", render: (row) => String(row.description ?? "") },
      {
        key: "deposits",
        label: "Deposits",
        cellClass: "text-slate-700",
        render: (row) => (Number(row.deposits ?? 0) > 0 ? `$${Number(row.deposits ?? 0).toFixed(2)}` : "—"),
      },
      {
        key: "withdrawals",
        label: "Withdrawals",
        cellClass: "text-red-700",
        render: (row) => (Number(row.withdrawals ?? 0) > 0 ? `$${Number(row.withdrawals ?? 0).toFixed(2)}` : "—"),
      },
      { key: "status", label: "Status", render: (row) => String(row.status ?? "synced") },
      { key: "category", label: "Category", render: (row) => String(row.category ?? "escrow") },
      {
        key: "settlement_id",
        label: "Settlement",
        render: (row) => {
          const sid = String(row.settlement_id ?? "").trim();
          if (!sid) return <span className="text-xs text-slate-500">—</span>;
          // BANK-F5751 — banking.routes.ts now joins driver_finance.driver_settlements for a real
          // display_id (e.g. "S-2026-0002"); this used to hardcode entityLabel(null, ...) and always
          // tombstone as "Settlement — not visible" even though the id resolved to a real row.
          return (
            <EntityLink
              kind="settlement"
              id={sid}
              label={visibleDocumentLabel(String(row.settlement_display_id ?? "") || null, sid, "Settlement")}
              data-testid="banking-escrow-settlement-link"
            />
          );
        },
      },
      {
        // WAVE-C-gl_je-driver-escrow: forward escrow movement -> its settlement's real deduction
        // GL JE (driver_finance.driver_settlement_gl_runs.deduction_journal_entry_id, one hop via
        // settlement_id — see escrow-visualizer.routes.ts). Honest "—" when no settlement GL run
        // exists yet for this movement (manual adjustment, or settlement not yet GL-posted).
        key: "journal_entry_id",
        label: "Journal Entry",
        render: (row) => {
          const jeId = String(row.journal_entry_id ?? "").trim();
          if (!jeId) return <span className="text-xs text-slate-500">—</span>;
          return (
            <EntityLink
              kind="journal_entry"
              id={jeId}
              label={visibleDocumentLabel(String(row.journal_entry_memo ?? "") || null, jeId, "Journal entry")}
              data-testid="banking-escrow-journal-entry-link"
            />
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      {driverBalancesQuery.isSuccess &&
      accountLedgerQuery.isSuccess &&
      listState.isEmpty &&
      Number(driverEscrowBalance ?? 0) === 0 &&
      driverRows.length === 0 ? (
        <div
          className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
          data-testid="banking-escrow-empty-honesty-banner"
        >
          <p className="font-semibold">Driver Escrow shows $0 with no ledger rows and no per-driver balances.</p>
          <p className="mt-1">
            Escrow is a liability virtual bank — empty is not “healthy zero” until settlements / deductions / holdbacks
            post into escrow and appear here. Cross-check Settlements and for-review bank rows that may be escrow-related
            but still unmatched.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link to="/driver-finance/settlements" className="font-medium text-slate-800 underline">
              Settlements
            </Link>
            <Link to="/banking/transactions?type=uncategorized" className="font-medium text-slate-800 underline">
              For-review Match/Categorize
            </Link>
          </div>
        </div>
      ) : null}
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
                  Driver:{" "}
                  <Link to={`/drivers/${selectedDriver.driver_id}`} className="text-slate-700 hover:underline">
                    {entityLabel(selectedDriver.driver_name, selectedDriver.driver_id, "Driver")}
                  </Link>
                </>
              ) : selectedDriverId ? (
                <>
                  Driver:{" "}
                  <Link to={`/drivers/${selectedDriverId}`} className="text-slate-700 hover:underline">
                    {entityLabel(undefined, selectedDriverId, "Driver")}
                  </Link>
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
            <EntityPicker
              kind="driver"
              operatingCompanyId={operatingCompanyId}
              value={selectedDriverId || null}
              onChange={(next) => setSelectedDriverId(next ?? "")}
              allowCreate={false}
              placeholder="All drivers (escrow account ledger)"
              className="mt-1"
              dataTestId="banking-escrow-filter-driver"
              disabled={!supportsPerDriverBreakdown}
            />
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

        {listState.isError ? (
          <div className="mt-2">
            <ListErrorBanner
              message="Failed to load the escrow ledger. Try refreshing."
              onRetry={() => void escrowLedgerQuery.refetch()}
            />
          </div>
        ) : null}

        <div className="mt-2">
          <ParityTable
            columns={columns}
            rows={tableRows}
            rowKey={(row) => String(row.id ?? "")}
            loading={listState.isLoading}
            storageKey="banking-driver-escrow-ledger"
            tableTestId="driver-escrow-ledger-table"
            // Settled-only empty text (LIST-EMPTY-1): supplied once listState resolves to "empty",
            // never mid-fetch, so ParityTable's own gate never flashes a false empty.
            emptyText={listState.isEmpty ? "No escrow ledger rows found for this filter." : undefined}
            // Doc-18 defect #12 — a register row must never be a dead click: drill through to the
            // driver the escrow movement belongs to (same target the "Ledger scope" driver link
            // above uses). Rows without a resolvable driver stay inert rather than faking a link.
            onRowClick={(row) => {
              const rowDriverId = String(row.driver_id ?? "");
              if (!rowDriverId) return;
              navigate(`/drivers/${rowDriverId}`);
            }}
            rowClassName={(row) => (String(row.driver_id ?? "") ? "" : "cursor-default")}
          />
        </div>
      </div>
    </div>
  );
}
