import { BulkSelectableTable } from "../../components/shared/BulkSelectableTable";
import { useToast } from "../../components/Toast";

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

  return (
    <BulkSelectableTable
      entityType="fuel-transactions"
      rows={rows}
      getRowId={(row) => row.id}
      bulkActions={[
        {
          id: "export",
          label: "Export CSV",
          onClick: () => {
            if (rows.length === 0) {
              pushToast("No fuel transactions to export.", "info");
              return;
            }
            exportFuelTransactionsCsv(rows);
          },
        },
        {
          // No bulk-categorize endpoint exists yet — honestly disabled instead of a fake success toast (QA-sweep).
          id: "categorize",
          label: "Categorize",
          disabled: true,
          onClick: () => pushToast("Bulk categorize is not available yet.", "info"),
        },
      ]}
    >
      {(ctx) => (
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="w-8 px-2 py-1">{ctx.renderHeaderCheckbox()}</th>
              <th className="px-2 py-1">Date</th>
              <th className="px-2 py-1">Driver</th>
              <th className="px-2 py-1">Station</th>
              <th className="px-2 py-1">Gallons</th>
              <th className="px-2 py-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-2 py-1">{ctx.renderRowCheckbox(row.id)}</td>
                <td className="px-2 py-1">{row.transaction_date}</td>
                <td className="px-2 py-1">{row.driver_name}</td>
                <td className="px-2 py-1">{row.station}</td>
                <td className="px-2 py-1">{row.gallons.toFixed(2)}</td>
                <td className="px-2 py-1">{money(row.amount_cents)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-gray-500">
                  No fuel transactions.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </BulkSelectableTable>
  );
}
