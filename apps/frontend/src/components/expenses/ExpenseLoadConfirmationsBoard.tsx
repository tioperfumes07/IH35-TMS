/**
 * 443.288-C — shared "Expense load confirmations" V3 board (Dispatch + Settlements Close).
 * Empty queue = all confirmed. Engine 404/501 = fail-closed (never pretend empty/confirmed).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  confirmExpenseLoads,
  ExpenseLoadConfirmEngineUnavailableError,
  formatProposalEvidence,
  listExpenseLoadConfirmations,
  type ExpenseLoadConfirmationRow,
  type ExpenseLoadConfirmationStatus,
} from "../../api/expenseLoadConfirmations";
import { EntityPicker } from "../EntityPicker";
import { EntityMultiSelect } from "../EntityMultiSelect";
import { ListErrorState } from "../ListErrorState";
import { useToast } from "../Toast";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { StatusBadge } from "../StatusBadge";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCentsTable, QBO_MONEY_CELL_CLASS } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";
import { V3 } from "../../design/v3-tokens";

export type ExpenseLoadConfirmationsBoardProps = {
  operatingCompanyId: string;
  /** When set, queue is scoped to expenses on that settlement's loads (Close blocking). */
  settlementId?: string | null;
  /** Default filter status. Dispatch defaults to proposed. */
  defaultStatus?: ExpenseLoadConfirmationStatus | "all";
  /** Compact layout for Close wizard embed. */
  compact?: boolean;
  testId?: string;
  /** Called after a successful confirm/change so Close can re-gate. */
  onQueueChanged?: () => void;
};

function cents(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function driverLabel(row: ExpenseLoadConfirmationRow): string {
  return (row.driver_name ?? "").trim() || "—";
}

export function ExpenseLoadConfirmationsBoard({
  operatingCompanyId,
  settlementId = null,
  defaultStatus = "proposed",
  compact = false,
  testId = "expense-load-confirmations-board",
  onQueueChanged,
}: ExpenseLoadConfirmationsBoardProps) {
  const companyId = operatingCompanyId;
  const qc = useQueryClient();
  const { pushToast } = useToast();

  const [status, setStatus] = useState<ExpenseLoadConfirmationStatus | "all">(defaultStatus);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [loadId, setLoadId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [changeLoadId, setChangeLoadId] = useState<string | null>(null);

  const queueQ = useQuery({
    queryKey: [
      "expense-load-confirmations",
      companyId,
      status,
      driverId,
      unitId,
      loadId,
      vendorId,
      settlementId ?? "",
    ],
    queryFn: () =>
      listExpenseLoadConfirmations(companyId, {
        status,
        driver_id: driverId ?? undefined,
        unit_id: unitId ?? undefined,
        load_id: loadId ?? undefined,
        vendor_uuid: vendorId ?? undefined,
        settlement_id: settlementId ?? undefined,
        limit: 500,
      }),
    enabled: Boolean(companyId),
    retry: false,
    refetchInterval: 60_000,
  });

  const engineUnavailable = queueQ.error instanceof ExpenseLoadConfirmEngineUnavailableError;
  const rows = queueQ.data?.rows ?? [];
  const proposedCount = rows.filter((r) => r.load_confirmation === "proposed").length;

  const confirmM = useMutation({
    meta: { loads: true },
    mutationFn: async (args: { expense_ids: string[]; load_id?: string | null }) => {
      if (!args.expense_ids.length) throw new Error("Select at least one expense.");
      return confirmExpenseLoads(companyId, args);
    },
    onSuccess: (res, vars) => {
      pushToast(
        vars.load_id
          ? `Changed load and confirmed ${res.confirmed} expense${res.confirmed === 1 ? "" : "s"}`
          : `Confirmed ${res.confirmed} expense${res.confirmed === 1 ? "" : "s"}`,
        "success",
      );
      setSelectedKeys([]);
      setChangeLoadId(null);
      void qc.invalidateQueries({ queryKey: ["expense-load-confirmations"] });
      onQueueChanged?.();
    },
    onError: (e) => pushToast(userFacingApiError(e, "Could not confirm expense loads."), "error"),
  });

  const columns = useMemo<ParityColumn<ExpenseLoadConfirmationRow>[]>(
    () => [
      {
        key: "transaction_date",
        label: "Date",
        sortable: true,
        render: (row) => formatDateUS(row.transaction_date),
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) => (
          <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={driverLabel(row)} noun="Driver" />
        ),
      },
      {
        key: "unit_number",
        label: "Truck",
        sortable: true,
        render: (row) =>
          row.unit_id ? (
            <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
          ) : (
            row.unit_number ?? "—"
          ),
      },
      {
        key: "vendor_name",
        label: "Vendor / station",
        sortable: true,
        render: (row) =>
          row.vendor_id ? (
            <EntityLinkOrTombstone kind="vendor" id={row.vendor_id} name={row.vendor_name} noun="Vendor" />
          ) : (
            row.vendor_name ?? "—"
          ),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        className: QBO_MONEY_CELL_CLASS,
        render: (row) => formatUsdCentsTable(cents(row.amount_cents)),
      },
      {
        key: "load_number",
        label: "Proposed load",
        sortable: true,
        render: (row) =>
          row.load_id ? (
            <EntityLinkOrTombstone kind="load" id={row.load_id} name={row.load_number} noun="Load" />
          ) : (
            "—"
          ),
      },
      {
        key: "proposal_evidence",
        label: "Evidence",
        sortable: false,
        render: (row) => formatProposalEvidence(row.proposal_evidence),
      },
      {
        key: "load_confirmation",
        label: "Status",
        sortable: true,
        render: (row) => <StatusBadge status={row.load_confirmation} />,
      },
      {
        key: "expense_number",
        label: "Expense",
        sortable: true,
        render: (row) => (
          <EntityLinkOrTombstone
            kind="expense"
            id={row.id}
            name={row.expense_number ?? row.id.slice(0, 8)}
            noun="Expense"
          />
        ),
      },
      {
        key: "settlement_number",
        label: "Settlement",
        sortable: true,
        render: (row) =>
          row.settlement_id ? (
            <EntityLinkOrTombstone
              kind="settlement"
              id={row.settlement_id}
              name={row.settlement_number}
              noun="Settlement"
            />
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  const filterBar = (
    <div
      data-testid="expense-load-confirmations-filters"
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
        gap: 8,
        marginBottom: 10,
      }}
    >
      <label className="block text-xs text-[#4B5563]">
        Status
        <select
          className="mt-1 h-9 w-full rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#0F1219]"
          value={status}
          onChange={(e) => setStatus(e.target.value as ExpenseLoadConfirmationStatus | "all")}
          data-testid="expense-load-confirmations-status"
        >
          <option value="proposed">Proposed</option>
          <option value="confirmed">Confirmed</option>
          <option value="all">All</option>
        </select>
      </label>
      <label className="block text-xs text-[#4B5563]">
        Driver
        <div className="mt-1">
          <EntityMultiSelect
            kind="driver"
            operatingCompanyId={companyId}
            value={driverId}
            onChange={(v) => setDriverId(v)}
            placeholder="All drivers"
          />
        </div>
      </label>
      <label className="block text-xs text-[#4B5563]">
        Truck
        <div className="mt-1">
          <EntityMultiSelect
            kind="unit"
            operatingCompanyId={companyId}
            value={unitId}
            onChange={(v) => setUnitId(v)}
            placeholder="All trucks"
          />
        </div>
      </label>
      <label className="block text-xs text-[#4B5563]">
        Load
        <div className="mt-1">
          <EntityMultiSelect
            kind="load"
            operatingCompanyId={companyId}
            value={loadId}
            onChange={(v) => setLoadId(v)}
            placeholder="All loads"
          />
        </div>
      </label>
      <label className="block text-xs text-[#4B5563]">
        Vendor
        <div className="mt-1">
          <EntityMultiSelect
            kind="vendor"
            operatingCompanyId={companyId}
            value={vendorId}
            onChange={(v) => setVendorId(v)}
            placeholder="All vendors"
          />
        </div>
      </label>
    </div>
  );

  const batchBar =
    selectedKeys.length > 0 ? (
      <div
        data-testid="expense-load-confirmations-batch"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          padding: "8px 10px",
          border: `1px solid ${V3.border}`,
          borderRadius: 2,
          background: V3.surface,
        }}
      >
        <span className="text-xs text-[#4B5563]">{selectedKeys.length} selected</span>
        <button
          type="button"
          className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#0F1219]"
          data-testid="expense-load-confirmations-bulk-confirm"
          disabled={confirmM.isPending || engineUnavailable}
          onClick={() => confirmM.mutate({ expense_ids: selectedKeys })}
        >
          Confirm proposed load
        </button>
        <div className="min-w-[200px] flex-1">
          <EntityPicker
            kind="load"
            operatingCompanyId={companyId}
            value={changeLoadId}
            onChange={(v) => setChangeLoadId(v)}
            allowCreate={false}
            placeholder="Change to load…"
          />
        </div>
        <button
          type="button"
          className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#0F1219]"
          data-testid="expense-load-confirmations-bulk-change"
          disabled={!changeLoadId || confirmM.isPending || engineUnavailable}
          onClick={() => {
            if (!changeLoadId) return;
            confirmM.mutate({ expense_ids: selectedKeys, load_id: changeLoadId });
          }}
        >
          Change load & confirm
        </button>
      </div>
    ) : null;

  if (!companyId) {
    return (
      <div className="rounded-sm border bg-white p-4 text-xs text-[#4B5563]" data-testid={testId}>
        Select an operating company.
      </div>
    );
  }

  if (engineUnavailable) {
    return (
      <div data-testid={testId} className="space-y-2">
        <ListErrorState
          title="Expense load confirmations unavailable"
          status={404}
          message="Confirm engine not on this deploy yet (443.288-B). Empty is not confirmed while the engine is missing."
          onRetry={() => void queueQ.refetch()}
        />
      </div>
    );
  }

  if (queueQ.isError) {
    return (
      <div data-testid={testId}>
        <ListErrorState
          title="Couldn't load expense load confirmations"
          status={0}
          message={(queueQ.error as Error)?.message}
          onRetry={() => void queueQ.refetch()}
        />
      </div>
    );
  }

  return (
    <div data-testid={testId} className="space-y-2">
      <h3 className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
        Expense load confirmations
      </h3>
      {filterBar}
      {batchBar}
      <ParityTable<ExpenseLoadConfirmationRow>
        appearance="board"
        title="Expense load confirmations"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={queueQ.isLoading}
        emptyText="All expenses on these loads are confirmed."
        storageKey={settlementId ? "expense-load-confirmations-close" : "expense-load-confirmations-dispatch"}
        exportFilename="expense-load-confirmations"
        tableTestId="expense-load-confirmations-table"
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
      />
      <p className="text-xs text-[#6B7280]" data-testid="expense-load-confirmations-count">
        {proposedCount} proposed · {rows.length} shown
        {status === "proposed" && rows.length === 0 && !queueQ.isLoading
          ? " — empty means confirmed"
          : ""}
      </p>
    </div>
  );
}

/** True when Close must refuse because proposed rows remain (or the engine is missing). */
export function closeBlockedByExpenseLoadConfirmations(args: {
  engineUnavailable: boolean;
  proposedCount: number;
  loading: boolean;
}): boolean {
  if (args.loading) return true;
  if (args.engineUnavailable) return true;
  return args.proposedCount > 0;
}
