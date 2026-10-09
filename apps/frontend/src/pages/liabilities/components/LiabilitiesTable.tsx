/**
 * LiabilitiesTable — display-only ParityTable migration (owner greenlit UI-only).
 *
 * Rows arrive as props (parent page owns the queries and error state); this component
 * performs no posting/mutation. Columns Display ID / Driver / Type / Source / Original $ /
 * Paid $ / Balance $ / Schedule / Status / Action, amount formatting (lib/money TableMoneyCell — accounting parentheses, em dash for missing),
 * pills, and the View Detail / Send Ack Request handlers preserved 1:1.
 */
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { TableMoneyCell } from "../../../components/table/TableMoneyCell";
import { QBO_MONEY_CELL_CLASS } from "../../../lib/money";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";

type LiabilityRow = Record<string, unknown>;

type Props = {
  rows: LiabilityRow[];
  onOpenDetail: (row: LiabilityRow) => void;
  onSendAck: (row: LiabilityRow) => void;
};

function typePill(type: string) {
  if (type === "equipment_loss") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (type === "civil_fine") return "bg-red-100 text-red-700";
  if (type === "advance") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (type === "antidoping" || type === "fuel") return "bg-[#F7F8FA] text-[#1F2A44]";
  return "bg-gray-100 text-gray-700";
}

function statusPill(status: string) {
  if (status === "pending_ack") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (status === "held") return "bg-[#F7F8FA] text-[#4B5563]";
  if (status === "paid_off") return "bg-gray-100 text-gray-700";
  return "bg-[#F7F8FA] text-[#1F2A44]";
}

export function LiabilitiesTable({ rows, onOpenDetail, onSendAck }: Props) {
  const columns: Array<ParityColumn<LiabilityRow>> = [
    {
      // GO-23 row16 (owner FINISH LAW 2026-09-03): this roster fetched created_at all along
      // (views.liabilities_active_with_context, ORDER BY created_at DESC in liabilities.routes.ts)
      // but never rendered it -- no date column existed anywhere on this list, the only date
      // signal available (this view carries no separate "incurred" timestamp).
      key: "created_at", minWidth: 132,
      label: "Date",
      sortable: true,
      render: (row) => formatDateUS(row.created_at),
    },
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
      kind: "money",
      minWidth: 120,
      cellClass: QBO_MONEY_CELL_CLASS,
      render: (row) => <TableMoneyCell dollars={row.original_amount as number | string | null | undefined} />,
    },
    {
      key: "paid_to_date",
      label: "Paid $",
      kind: "money",
      minWidth: 120,
      cellClass: QBO_MONEY_CELL_CLASS,
      render: (row) => <TableMoneyCell dollars={row.paid_to_date as number | string | null | undefined} />,
    },
    {
      key: "current_balance",
      label: "Balance $",
      cellClass: `${QBO_MONEY_CELL_CLASS} font-semibold`,
      kind: "money",
      minWidth: 120,
      render: (row) => <TableMoneyCell dollars={row.current_balance as number | string | null | undefined} />,
    },
    {
      key: "scheduled_deduction",
      label: "Schedule",
      kind: "money",
      minWidth: 120,
      cellClass: QBO_MONEY_CELL_CLASS,
      render: (row) => <TableMoneyCell dollars={row.scheduled_deduction as number | string | null | undefined} />,
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
            <button type="button" className="text-[#1F2A44] underline" onClick={() => onOpenDetail(row)}>View Detail</button>
            {status === "pending_ack" ? (
              <button type="button" className="text-[#1F2A44] underline" onClick={() => onSendAck(row)}>Send Ack Request</button>
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
