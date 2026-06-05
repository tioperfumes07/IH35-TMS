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

export function FuelTransactionsTable({ rows }: Props) {
  const { pushToast } = useToast();

  return (
    <BulkSelectableTable
      entityType="fuel-transactions"
      rows={rows}
      getRowId={(row) => row.id}
      bulkActions={[
        { id: "export", label: "Export Selected", onClick: () => pushToast("Export fuel transactions queued.", "success") },
        { id: "categorize", label: "Categorize", onClick: () => pushToast("Categorize fuel txns — bulk endpoint pending.", "success") },
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
