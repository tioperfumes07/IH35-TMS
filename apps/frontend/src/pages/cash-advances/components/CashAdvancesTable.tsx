import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Row = Record<string, unknown>;

type Props = {
  rows: Row[];
  onOpenDetail: (row: Row) => void;
  onMarkDisbursed: (row: Row) => void;
};

function statusPill(status: string) {
  if (status === "pending_approval") return "bg-slate-100 text-slate-700";
  if (status === "approved") return "bg-slate-100 text-slate-700";
  if (status === "disbursed") return "bg-slate-100 text-slate-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "reversed") return "bg-gray-100 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

export function CashAdvancesTable({ rows, onOpenDetail, onMarkDisbursed }: Props) {
  const columns: Array<ParityColumn<Row>> = [
    {
      key: "display_id",
      label: "Display ID",
      sortable: true,
      render: (row) => (
        <span className="font-medium">{String(row.display_id ?? String(row.id).slice(0, 8))}</span>
      ),
      sortValue: (row) => String(row.display_id ?? String(row.id).slice(0, 8)),
    },
    {
      key: "driver_full_name",
      label: "Driver",
      sortable: true,
      render: (row) => String(row.driver_full_name ?? "—"),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      render: (row) => `$${Number(row.amount ?? 0).toFixed(2)}`,
      sortValue: (row) => Number(row.amount ?? 0),
    },
    {
      key: "purpose",
      label: "Purpose",
      sortable: true,
      render: (row) => String(row.purpose ?? "—"),
    },
    {
      key: "disbursement_method",
      label: "Method",
      sortable: true,
      render: (row) => String(row.disbursement_method ?? "—"),
    },
    {
      key: "disbursement_status",
      label: "Disbursement Status",
      sortable: true,
      render: (row) => {
        const status = String(row.disbursement_status ?? "pending_approval");
        return <span className={`rounded-full px-2 py-0.5 ${statusPill(status)}`}>{status}</span>;
      },
      sortValue: (row) => String(row.disbursement_status ?? "pending_approval"),
    },
    {
      key: "outstanding_balance",
      label: "Outstanding",
      sortable: true,
      render: (row) => `$${Number(row.outstanding_balance ?? 0).toFixed(2)}`,
      sortValue: (row) => Number(row.outstanding_balance ?? 0),
    },
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      render: (row) => String(row.created_at ?? "").slice(0, 10) || "—",
      sortValue: (row) => String(row.created_at ?? ""),
    },
    {
      key: "actions",
      label: "Action",
      alwaysVisible: true,
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
  ];

  return (
    <ParityTable<Row>
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.id)}
      emptyText="No cash advances found."
      storageKey="cash-advances-table"
      tableTestId="cash-advances-table"
    />
  );
}
