type Props = {
  row: Record<string, unknown>;
  selected: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: () => void;
  onSelect: () => void;
  onCategorize: () => void;
  onUndo: () => void;
};

function statusPill(status: string) {
  if (status === "uncategorized") return "bg-amber-100 text-amber-700";
  if (status === "reconciled") return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
}

export function RegisterRow({ row, selected, bulkSelected = false, onBulkToggle, onSelect, onCategorize, onUndo }: Props) {
  const status = String(row.status ?? "synced");
  const amount = Number(row.amount ?? row.deposits ?? 0);
  const deposits = Number(row.deposits ?? (amount >= 0 ? amount : 0));
  const withdrawals = Number(row.withdrawals ?? (amount < 0 ? Math.abs(amount) : 0));
  return (
    <tr
      className={`border-t border-gray-100 text-xs ${status === "uncategorized" ? "bg-amber-50" : ""} ${selected ? "border-l-2 border-l-blue-500" : ""}`}
      onClick={onSelect}
    >
      <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
        <input type="checkbox" checked={bulkSelected} onChange={() => onBulkToggle?.()} aria-label="Select row" />
      </td>
      <td className="px-2 py-1">{String(row.txn_date ?? "")}</td>
      <td className="px-2 py-1">{String(row.description ?? "")}</td>
      <td className="px-2 py-1 text-green-700">{deposits > 0 ? `$${deposits.toFixed(2)}` : "—"}</td>
      <td className="px-2 py-1 text-red-700">{withdrawals > 0 ? `$${withdrawals.toFixed(2)}` : "—"}</td>
      <td className="px-2 py-1">${Number(row.balance ?? 0).toFixed(2)}</td>
      <td className="px-2 py-1"><span className={`rounded-full px-2 py-0.5 text-[10px] ${statusPill(status)}`}>{status === "uncategorized" ? "Uncat" : status === "reconciled" ? "Reconciled" : "Synced"}</span></td>
      <td className="px-2 py-1">{String(row.category ?? "—")}</td>
      <td className="px-2 py-1">
        {status === "uncategorized" ? (
          <button type="button" onClick={onCategorize} className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">Categorize ▼</button>
        ) : (
          <button type="button" onClick={onUndo} className="text-blue-700 underline">Undo</button>
        )}
      </td>
    </tr>
  );
}
