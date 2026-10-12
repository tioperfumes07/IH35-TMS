import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getEscrowDriverBalances,
  getEscrowDriverTimeline,
  type EscrowDriverBalance,
} from "../../../api/banking";
import { ActionButton } from "../../../components/shared/ActionButton";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsd } from "../../../lib/money";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { useToast } from "../../../components/Toast";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Props = {
  operatingCompanyId: string;
  driverEscrowBalance: number;
};

type EscrowBoardRow = {
  driver_id: string;
  driver_name: string | null;
  held: number;
  /** Target not on escrow API this round — show — until gear/chooser adds it. */
  target: number | null;
  unit: string | null;
  lastWithheldAt: string | null;
  settlementId: string | null;
  settlementLabel: string | null;
};

function progressPct(row: EscrowBoardRow): number | null {
  return row.target != null && row.target > 0 ? Math.min(100, Math.round((row.held / row.target) * 100)) : null;
}

function dash(v: string | number | null | undefined) {
  if (v == null || v === "") return "—";
  return String(v);
}

/**
 * C-64 board 6 — Driver Escrow (owner-accepted).
 * Default columns only; extra columns live in the gear chooser (do not widen default).
 * Right rail: Both sides of the entry (display only) + Release rules (Save + Close).
 */
export function DriverEscrowBoardSection({ operatingCompanyId, driverEscrowBalance }: Props) {
  const { pushToast } = useToast();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [releaseDriverId, setReleaseDriverId] = useState<string | null>(null);
  const [releaseRuleDraft, setReleaseRuleDraft] = useState({
    autoReleaseAtTarget: false,
    minHeldDollars: null as number | null,
    note: "",
  });
  const [savedRules, setSavedRules] = useState(releaseRuleDraft);

  const balancesQuery = useQuery({
    queryKey: ["banking", "escrow", "drivers", operatingCompanyId],
    queryFn: () => getEscrowDriverBalances(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const timelineQuery = useQuery({
    queryKey: ["banking", "escrow", "timeline-board", operatingCompanyId, selectedDriverId ?? "none"],
    queryFn: () => getEscrowDriverTimeline(operatingCompanyId, selectedDriverId!),
    enabled: Boolean(operatingCompanyId && selectedDriverId),
  });

  const boardRows: EscrowBoardRow[] = useMemo(() => {
    const drivers = balancesQuery.data?.drivers ?? [];
    return drivers
      .filter((d: EscrowDriverBalance) => Number(d.escrow_balance ?? 0) !== 0 || true)
      .map((d) => ({
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        held: Number(d.escrow_balance ?? 0),
        target: null,
        unit: null,
        lastWithheldAt: null,
        settlementId: null,
        settlementLabel: null,
      }));
  }, [balancesQuery.data?.drivers]);

  // Enrich selected / first rows with last withheld + settlement from timeline when available.
  useEffect(() => {
    if (!selectedDriverId && boardRows[0]?.driver_id) {
      setSelectedDriverId(boardRows[0].driver_id);
    }
  }, [boardRows, selectedDriverId]);

  const enrichedRows = useMemo(() => {
    const timeline = timelineQuery.data?.timeline ?? [];
    const lastDeposit = timeline.find((t) => String(t.entry_type ?? "").toLowerCase() === "deposit") ?? timeline[0];
    return boardRows.map((row) => {
      if (row.driver_id !== selectedDriverId || !lastDeposit) return row;
      return {
        ...row,
        lastWithheldAt: lastDeposit.created_at ?? null,
        settlementId: lastDeposit.settlement_id ?? null,
        settlementLabel: lastDeposit.settlement_id
          ? visibleDocumentLabel(null, lastDeposit.settlement_id, "Settlement")
          : null,
      };
    });
  }, [boardRows, selectedDriverId, timelineQuery.data?.timeline]);

  const heldTotal = enrichedRows.reduce((s, r) => s + r.held, 0);
  const targetTotal = enrichedRows.every((r) => r.target == null)
    ? null
    : enrichedRows.reduce((s, r) => s + Number(r.target ?? 0), 0);

  // 443.99 — the board is the shared ParityTable (was a hand-rolled HTML table with its own gear): the
  // ParityTable gear is the column chooser, its sort/resize/export apply, and the totals are footerCells.
  const columns: Array<ParityColumn<EscrowBoardRow>> = [
    {
      key: "driver",
      label: "Driver",
      sortable: true,
      sortValue: (row) => entityLabel(row.driver_name, row.driver_id, "Driver"),
      render: (row) => (
        <Link to={`/drivers/${row.driver_id}`} className="text-[#1F2A44] hover:underline">
          {entityLabel(row.driver_name, row.driver_id, "Driver")}
        </Link>
      ),
    },
    { key: "unit", label: "Unit", sortable: true, sortValue: (row) => row.unit, render: (row) => dash(row.unit) },
    {
      key: "held",
      label: "Held",
      kind: "money",
      sortable: true,
      minWidth: 120,
      sortValue: (row) => row.held,
      // row.held is in dollars (escrow_balance); MoneyCell only formats it through formatUsd.
      render: (row) => <MoneyCell cents={row.held} format={formatUsd} drill={{ entity: { kind: "escrow_record", id: row.driver_id } }} />,
    },
    {
      key: "target",
      label: "Target",
      kind: "money",
      sortable: true,
      minWidth: 120,
      sortValue: (row) => row.target,
      render: (row) => <MoneyCell cents={row.target} format={formatUsd} drill={{ none: "Escrow target is a driver setting, not a transaction" }} />,
    },
    {
      key: "progress",
      label: "Progress",
      sortable: true,
      minWidth: 120,
      sortValue: (row) => progressPct(row),
      render: (row) => {
        const pct = progressPct(row);
        return pct == null ? (
          <span className="block text-center text-[#6B7280]">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-sm bg-[#E5E7EB]">
              <div className="h-full bg-[#14314F]" style={{ width: `${pct}%` }} />
            </div>
            <span data-quantity className="w-10 text-right tabular-nums text-[#6B7280]">{pct}%</span>
          </div>
        );
      },
    },
    {
      key: "last_withheld_at",
      label: "Last withheld",
      sortable: true,
      minWidth: 132,
      sortValue: (row) => row.lastWithheldAt,
      render: (row) => (row.lastWithheldAt ? formatDateUS(row.lastWithheldAt) : "—"),
    },
    {
      key: "settlement",
      label: "Settlement",
      sortable: true,
      sortValue: (row) => row.settlementLabel,
      render: (row) =>
        row.settlementId ? (
          <EntityLink kind="settlement" id={row.settlementId} label={row.settlementLabel ?? "Settlement"} />
        ) : (
          "—"
        ),
    },
    {
      key: "release",
      label: "Release",
      sortable: false,
      render: (row) => (
        <button
          type="button"
          className="inline-flex h-[34px] items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
          onClick={(e) => {
            e.stopPropagation();
            setReleaseDriverId(row.driver_id);
            setSelectedDriverId(row.driver_id);
          }}
        >
          Release
        </button>
      ),
    },
  ];

  const saveRules = () => {
    setSavedRules(releaseRuleDraft);
    pushToast("Release rules saved.", "success");
  };

  const closeRules = () => {
    setReleaseRuleDraft(savedRules);
    setReleaseDriverId(null);
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]" data-c64-driver-escrow-board="1">
      <div className="space-y-3 min-w-0">
        <div
          className="rounded-sm border border-[#E5E7EB] px-3 py-2 text-xs"
          style={{ borderLeft: "3px solid #B54708", background: "#FFFAEB" }}
          data-testid="banking-escrow-liability-honesty-banner"
        >
          <p className="font-semibold text-[#0F1219]">
            Driver Escrow is a liability — the company owes {formatUsd(Number(driverEscrowBalance ?? 0))} back
            across {enrichedRows.filter((d) => d.held !== 0).length} driver(s) with a balance.
          </p>
          <p className="mt-1 text-[#6B7280]">
            Never book escrow to an expense account. Extra columns live in the gear — default view stays narrow.
          </p>
        </div>

        {balancesQuery.isError ? (
          <ListErrorBanner message="Failed to load driver escrow balances." onRetry={() => void balancesQuery.refetch()} />
        ) : null}

        <div className="rounded-sm border border-[#E5E7EB] bg-white">
          <div className="border-b border-[#E5E7EB] px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Driver escrow</p>
          </div>
          <ParityTable<EscrowBoardRow>
            embedded
            rows={enrichedRows}
            rowKey={(row) => row.driver_id}
            columns={columns}
            loading={balancesQuery.isLoading}
            emptyText="No driver escrow balances"
            storageKey="banking-driver-escrow-board"
            exportFilename="driver-escrow"
            tableTestId="driver-escrow-board-table"
            gearButtonTestId="escrow-column-gear"
            rowTestId={(row) => `escrow-board-row-${row.driver_id}`}
            onRowClick={(row) => setSelectedDriverId(row.driver_id)}
            rowClassName={(row) => (row.driver_id === selectedDriverId ? "bg-[#F7F8FA]" : "")}
            suppressToolbarRange
            footerCells={{
              driver: "Totals",
              held: (
                <span data-testid="escrow-footer-held">
                  <MoneyCell cents={heldTotal} format={formatUsd} drill={{ none: "Total of the rows above — each row opens that driver's escrow record" }} />
                </span>
              ),
              target: (
                <span data-testid="escrow-footer-target">
                  <MoneyCell cents={targetTotal} format={formatUsd} drill={{ none: "Total of the escrow targets above — targets are driver settings" }} />
                </span>
              ),
            }}
          />
        </div>
      </div>

      <aside className="space-y-3" data-testid="escrow-right-rail">
        <section className="rounded-sm border border-[#E5E7EB] bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Both sides of the entry</p>
          <p className="mt-1 text-xs text-[#6B7280]">Display only this round — no posting.</p>
          <dl className="mt-2 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[#6B7280]">Debit</dt>
              <dd className="text-right font-medium text-[#0F1219]">Driver Escrow Liability (2100)</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[#6B7280]">Credit</dt>
              <dd className="text-right font-medium text-[#0F1219]">Cash / Settlement clearing</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-sm border border-[#E5E7EB] bg-white p-3" data-testid="escrow-release-rules">
          <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Release rules</p>
          {releaseDriverId ? (
            <p className="mt-1 text-xs text-[#6B7280]">
              Releasing for{" "}
              <EntityLink
                kind="driver"
                id={releaseDriverId}
                label={entityLabel(
                  enrichedRows.find((r) => r.driver_id === releaseDriverId)?.driver_name,
                  releaseDriverId,
                  "Driver",
                )}
              />
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#6B7280]">Company-wide defaults. Click Release on a row to scope.</p>
          )}
          <label className="mt-3 flex items-center gap-2 text-xs text-[#0F1219]">
            <input
              type="checkbox"
              checked={releaseRuleDraft.autoReleaseAtTarget}
              onChange={(e) =>
                setReleaseRuleDraft((d) => ({ ...d, autoReleaseAtTarget: e.target.checked }))
              }
            />
            Auto-release when Held reaches Target
          </label>
          <label className="mt-2 block text-xs text-[#4B5563]">
            Minimum held
            <div className="mt-1" style={{ maxWidth: 120 }}>
              <MoneyInput
                valueDollars={releaseRuleDraft.minHeldDollars}
                onChangeDollars={(d) => setReleaseRuleDraft((prev) => ({ ...prev, minHeldDollars: d }))}
                ariaLabel="Minimum held (USD)"
                placeholder="—"
                className="w-[120px]"
              />
            </div>
          </label>
          <label className="mt-2 block text-xs text-[#4B5563]">
            Note
            <textarea
              className="mt-1 block min-h-[64px] w-full rounded-sm border border-[#E5E7EB] px-2 py-1.5 text-xs"
              value={releaseRuleDraft.note}
              onChange={(e) => setReleaseRuleDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </label>
          <div className="mt-3 flex items-center justify-end gap-2">
            <ActionButton onClick={closeRules} data-testid="escrow-release-close">
              Close
            </ActionButton>
            <button
              type="button"
              className="inline-flex h-[34px] items-center rounded-sm bg-[#14314F] px-3 text-xs font-bold text-white"
              data-testid="escrow-release-save"
              onClick={saveRules}
            >
              Save
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
