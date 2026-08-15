import { useMemo } from "react";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { entityLabel } from "../../../lib/entity-label";

type CashAdvanceRow = Record<string, unknown>;

type Props = {
  rows: Array<CashAdvanceRow>;
  onOpenDetail: (row: CashAdvanceRow) => void;
  onMarkDisbursed: (row: CashAdvanceRow) => void;
  /** SETL-S02 — show spinner while parent useListState is loading. */
  isLoading?: boolean;
};

function statusPill(status: string) {
  if (status === "pending_approval") return "bg-slate-100 text-slate-700";
  if (status === "approved") return "bg-slate-100 text-slate-700";
  if (status === "disbursed") return "bg-slate-100 text-slate-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "reversed") return "bg-gray-100 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

export function CashAdvancesTable({ rows, onOpenDetail, onMarkDisbursed, isLoading = false }: Props) {
  const columns = useMemo<ParityColumn<CashAdvanceRow>[]>(
    () => [
      {
        key: "display_id",
        label: "Display ID",
        render: (row) => (
          <EntityLink
            kind="cash_advance"
            id={String(row.id)}
            label={entityLabel(row.display_id != null ? String(row.display_id) : null, String(row.id), "Advance")}
            data-testid="cash-advance-roster-record-link"
          />
        ),
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (row) => (
          <EntityLink
            kind="driver"
            id={row.driver_id ? String(row.driver_id) : null}
            label={entityLabel(
              row.driver_full_name ? String(row.driver_full_name) : null,
              row.driver_id ? String(row.driver_id) : null,
              "Driver",
            )}
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        render: (row) => `$${Number(row.amount ?? 0).toFixed(2)}`,
      },
      {
        key: "purpose",
        label: "Purpose",
        render: (row) => String(row.purpose ?? "—"),
      },
      {
        key: "disbursement_method",
        label: "Method",
        render: (row) => String(row.disbursement_method ?? "—"),
      },
      {
        key: "disbursement_status",
        label: "Disbursement Status",
        render: (row) => {
          const status = String(row.disbursement_status ?? "pending_approval");
          return <span className={`rounded-full px-2 py-0.5 ${statusPill(status)}`}>{status}</span>;
        },
      },
      {
        key: "outstanding_balance",
        label: "Outstanding",
        sortable: true,
        render: (row) => `$${Number(row.outstanding_balance ?? 0).toFixed(2)}`,
      },
      {
        key: "created_at",
        label: "Created",
        sortable: true,
        render: (row) => String(row.created_at ?? "").slice(0, 10) || "—",
      },
      {
        key: "action",
        label: "Action",
        render: (row) => {
          const status = String(row.disbursement_status ?? "pending_approval");
          return (
            <div className="flex gap-2">
              <button type="button" className="text-slate-700 underline" onClick={() => onOpenDetail(row)}>
                View Detail
              </button>
              {status !== "disbursed" && status !== "reversed" ? (
                <button type="button" className="text-slate-700 underline" onClick={() => onMarkDisbursed(row)}>
                  Mark Disbursed
                </button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [onOpenDetail, onMarkDisbursed],
  );

  return (
    // SETL-F3544: ParityTable owns Search+Range+gear; raw HTML table skipped the surface bar.
    <div data-testid="cash-advances-empty">
      <ParityTable<CashAdvanceRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={isLoading}
        emptyText="No cash advances found — none created for this entity yet (or no rows match the current filter)."
        storageKey="cash-advances-roster"
        exportFilename="cash-advances"
        tableTestId="cash-advances-table"
      />
    </div>
  );
}
