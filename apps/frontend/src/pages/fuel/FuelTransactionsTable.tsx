import { useToast } from "../../components/Toast";
import { useBulkPermission } from "../../hooks/useBulkPermission";
import { ParityTable } from "../../components/parity/ParityTable";

export type FuelTransactionRow = {
  id: string;
  transaction_date: string;
  driver_name: string;
  gallons: number;
  amount_cents: number;
  station: string;
};

type Props = {
  rows: FuelTransactionRow[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Real client-side CSV export of the fuel-transaction rows in scope (QA-sweep: was a fake success toast).
function exportFuelTransactionsCsv(rows: FuelTransactionRow[]): void {
  const header = ["Date", "Driver", "Station", "Gallons", "Amount (USD)"].map(csvEscape).join(",");
  const body = rows
    .map((row) =>
      [
        row.transaction_date,
        row.driver_name,
        row.station,
        (row.gallons || 0).toFixed(2),
        ((row.amount_cents || 0) / 100).toFixed(2),
      ]
        .map((v) => csvEscape(String(v)))
        .join(",")
    )
    .join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuel-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function FuelTransactionsTable({ rows }: Props) {
  const { pushToast } = useToast();
  // Same role gate the old BulkSelectableTable wrapper enforced (BULK_WRITE_ROLES via
  // useBulkPermission) — preserved here so bulk selection/actions stay hidden for roles that
  // couldn't see them before.
  const bulkPermission = useBulkPermission();

  return (
    <ParityTable
      rows={rows}
      rowKey={(row) => row.id}
      storageKey="fuel-transactions"
      emptyText="No fuel transactions."
      selectable={bulkPermission.canUseBulkOps}
      batchActions={() => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            onClick={() => {
              if (rows.length === 0) {
                pushToast("No fuel transactions to export.", "info");
                return;
              }
              exportFuelTransactionsCsv(rows);
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled
            title="Bulk categorize is not available yet."
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            onClick={() => pushToast("Bulk categorize is not available yet.", "info")}
          >
            Categorize
          </button>
        </div>
      )}
      columns={[
        { key: "transaction_date", label: "Date", sortable: true },
        { key: "driver_name", label: "Driver", sortable: true },
        { key: "station", label: "Station", sortable: true },
        { key: "gallons", label: "Gallons", sortable: true, render: (row) => row.gallons.toFixed(2) },
        { key: "amount_cents", label: "Amount", sortable: true, render: (row) => money(row.amount_cents) },
      ]}
    />
  );
}
