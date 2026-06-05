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

  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <BulkActionBar
        {...selection.bulkActionBarProps([
          { id: "categorize", label: "Categorize", onClick: () => pushToast("Bulk categorize register rows.", "success") },
          { id: "export", label: "Export Selected", onClick: () => pushToast("Export register rows queued.", "success") },
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
