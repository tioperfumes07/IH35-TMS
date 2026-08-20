/**
 * LiabilitiesTable — display-only ParityTable migration (owner greenlit UI-only).
 *
 * Rows arrive as props (parent page owns the queries and error state); this component
 * performs no posting/mutation. Columns Display ID / Driver / Type / Source / Original $ /
 * Paid $ / Balance $ / Schedule / Status / Action, amount formatting ($ + toFixed(2)),
 * pills, and the View Detail / Send Ack Request handlers preserved 1:1.
 */
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type LiabilityRow = Record<string, unknown>;

type Props = {
  rows: LiabilityRow[];
  onOpenDetail: (row: LiabilityRow) => void;
  onSendAck: (row: LiabilityRow) => void;
};

function typePill(type: string) {
  if (type === "equipment_loss") return "bg-slate-100 text-slate-700";
  if (type === "civil_fine") return "bg-red-100 text-red-700";
  if (type === "advance") return "bg-slate-100 text-slate-700";
  if (type === "antidoping" || type === "fuel") return "bg-slate-100 text-slate-700";
  return "bg-gray-100 text-gray-700";
}

function statusPill(status: string) {
  if (status === "pending_ack") return "bg-slate-100 text-slate-700";
  if (status === "held") return "bg-slate-100 text-slate-600";
  if (status === "paid_off") return "bg-gray-100 text-gray-700";
  return "bg-slate-100 text-slate-700";
}

export function LiabilitiesTable({ rows, onOpenDetail, onSendAck }: Props) {
  const columns: Array<ParityColumn<LiabilityRow>> = [
    {
      key: "id",
      label: "Display ID",
      // ACCT-F5615 — driver_finance.driver_liabilities has no display_id column (confirmed against
      // its own DDL, 0138_p8b_j_pr3_driver_finance_stack.sql), so passing null here fed entityLabel's
      // id-no-name branch a row.id that ALWAYS resolves (it's the row's own PK, never a failed join) --
      // every liability on this roster rendered the literal fallback text "Liability — not visible",
      // the exact false-tombstone symptom entityLabel's own header warns against, misapplied to a
      // record that unambiguously exists. Fixed by passing row.type as the name, mirroring the
      // identical, already-correct pattern DriverSettlementFinanceReverseSection.tsx already uses for
      // this same table (entityLabel(l.type, id, "Liability")).
      render: (row) => <EntityLink kind="liability" id={String(row.id)} label={entityLabel(row.type as string | null, row.id, "Liability")} data-testid="liability-roster-record-link" />,
    },
    {
      key: "driver_full_name",
      label: "Driver",
      render: (row) => (
        <EntityLink
          kind="driver"
          id={row.driver_id ? String(row.driver_id) : null}
          label={entityLabel(
            row.driver_full_name ? String(row.driver_full_name) : null,
            row.driver_id ? String(row.driver_id) : null,
            "Driver"
          )}
          onClick={(event) => event.stopPropagation()}
        />
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (row) => (
        <span className={`rounded-full px-2 py-0.5 ${typePill(String(row.type ?? ""))}`}>
          {String(row.type ?? "type")}
        </span>
      ),
    },
    {
      key: "source_description",
      label: "Source",
      render: (row) => <>{String(row.source_description ?? "—")}</>,
    },
    {
      key: "original_amount",
      label: "Original $",
      render: (row) => <>${Number(row.original_amount ?? 0).toFixed(2)}</>,
    },
    {
      key: "paid_to_date",
      label: "Paid $",
      render: (row) => <>${Number(row.paid_to_date ?? 0).toFixed(2)}</>,
    },
    {
      key: "current_balance",
      label: "Balance $",
      cellClass: "font-semibold",
      render: (row) => <>${Number(row.current_balance ?? 0).toFixed(2)}</>,
    },
    {
      key: "scheduled_deduction",
      label: "Schedule",
      render: (row) => <>${Number(row.scheduled_deduction ?? 0).toFixed(2)}</>,
    },
    {
      key: "display_status",
      label: "Status",
      render: (row) => {
        const status = String(row.display_status ?? "active");
        return (
          <span className={`rounded-full px-2 py-0.5 ${statusPill(status)}`}>{status}</span>
        );
      },
    },
    {
      key: "action",
      label: "Action",
      render: (row) => {
        const status = String(row.display_status ?? "active");
        return (
          <div className="flex gap-2">
            <button type="button" className="text-slate-700 underline" onClick={() => onOpenDetail(row)}>View Detail</button>
            {status === "pending_ack" ? (
              <button type="button" className="text-slate-700 underline" onClick={() => onSendAck(row)}>Send Ack Request</button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <ParityTable
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.id)}
      storageKey="liabilities-table"
      tableTestId="liabilities-table"
      emptyText="No active liabilities."
    />
  );
}
