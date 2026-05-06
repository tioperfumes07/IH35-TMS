import { RegisterRow } from "./RegisterRow";

type Props = {
  rows: Array<Record<string, unknown>>;
  selectedTransactionId: string | null;
  onSelect: (row: Record<string, unknown>) => void;
  onCategorize: (row: Record<string, unknown>) => void;
  onUndo: (row: Record<string, unknown>) => void;
};

export function RegisterTable({ rows, selectedTransactionId, onSelect, onCategorize, onUndo }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-[1150px] w-full text-left">
        <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
          <tr>
            <th className="px-2 py-1">☐</th>
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
              onSelect={() => onSelect(row)}
              onCategorize={() => onCategorize(row)}
              onUndo={() => onUndo(row)}
            />
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="px-2 py-3 text-center text-xs text-gray-500">No transactions for selected account.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
