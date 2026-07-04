import { BulkActionBar } from "../../../components/bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../../../components/bulk/TableSelection";
import { useToast } from "../../../components/Toast";
import { useBulkSelection } from "../../../hooks/useBulkSelection";
import { RegisterRow } from "./RegisterRow";

type Props = {
  rows: Array<Record<string, unknown>>;
  selectedTransactionId: string | null;
  onSelect: (row: Record<string, unknown>) => void;
  onCategorize: (row: Record<string, unknown>) => void;
  onUndo: (row: Record<string, unknown>) => void;
};

export function RegisterTable({ rows, selectedTransactionId, onSelect, onCategorize, onUndo }: Props) {
  const { pushToast } = useToast();
  const selection = useBulkSelection({ cap: 200, onCapExceeded: (e) => pushToast(e.message, "error") });
  const pageRowIds = rows.map((row) => String(row.id));

  // Real client-side CSV export of the selected register rows (previously a fake success toast with no action).
  function exportSelected() {
    const selected = rows.filter((row) => selection.selectedIds.has(String(row.id)));
    if (selected.length === 0) {
      pushToast("Select transactions to export.", "error");
      return;
    }
    const header = ["Date", "Description", "Deposits", "Withdrawals", "Balance", "Status", "Category"];
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = selected.map((row) => {
      const amount = Number(row.amount ?? row.deposits ?? 0);
      const deposits = Number(row.deposits ?? (amount >= 0 ? amount : 0));
      const withdrawals = Number(row.withdrawals ?? (amount < 0 ? Math.abs(amount) : 0));
      return [
        String(row.txn_date ?? ""),
        String(row.description ?? ""),
        deposits > 0 ? deposits.toFixed(2) : "",
        withdrawals > 0 ? withdrawals.toFixed(2) : "",
        Number(row.balance ?? 0).toFixed(2),
        String(row.status ?? "synced"),
        String(row.category ?? ""),
      ];
    });
    const csv = [header, ...lines].map((row) => row.map((cell) => escape(String(cell ?? ""))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "banking-register-selected.csv";
    anchor.click();
    URL.revokeObjectURL(href);
    pushToast(`Exported ${selected.length} transaction(s).`, "success");
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
      <BulkActionBar
        {...selection.bulkActionBarProps([
          {
            id: "categorize",
            label: "Categorize",
            onClick: () =>
              pushToast("Open a row and choose its account to categorize. Bulk categorize-by-account is coming next.", "info"),
          },
          { id: "export", label: "Export Selected", onClick: () => exportSelected() },
        ])}
      />
      <TableSelection
        rows={rows}
        getId={(row) => String(row.id)}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        cap={selection.cap}
      >
        {({ isSelected, toggle }) => (
          <table className="min-w-[1150px] w-full text-left">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
              <tr>
                <th className="w-8 px-2 py-1">
                  <TableSelectionHeader
                    selectedIds={selection.selectedIds}
                    pageRowIds={pageRowIds}
                    onSelectionChange={selection.setSelectedIds}
                    cap={selection.cap}
                  />
                </th>
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Description</th>
                <th className="px-2 py-1">Deposits</th>
                <th className="px-2 py-1">Withdrawals</th>
                <th className="px-2 py-1">Balance</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Category</th>
                <th className="px-2 py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RegisterRow
                  key={String(row.id)}
                  row={row}
                  selected={selectedTransactionId === String(row.id)}
                  bulkSelected={isSelected(String(row.id))}
                  onBulkToggle={() => toggle(String(row.id))}
                  onSelect={() => onSelect(row)}
                  onCategorize={() => onCategorize(row)}
                  onUndo={() => onUndo(row)}
                />
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-3 text-center text-xs text-gray-500">
                    No transactions for selected account.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </TableSelection>
    </div>
  );
}
