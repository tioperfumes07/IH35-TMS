type Props = {
  rows: Array<Record<string, unknown>>;
  onOpenDetail: (row: Record<string, unknown>) => void;
  onSendAck: (row: Record<string, unknown>) => void;
};

function typePill(type: string) {
  if (type === "equipment_loss") return "bg-amber-100 text-amber-700";
  if (type === "civil_fine") return "bg-red-100 text-red-700";
  if (type === "advance") return "bg-blue-100 text-blue-700";
  if (type === "antidoping" || type === "fuel") return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-700";
}

function statusPill(status: string) {
  if (status === "pending_ack") return "bg-amber-100 text-amber-700";
  if (status === "held") return "bg-yellow-100 text-yellow-700";
  if (status === "paid_off") return "bg-gray-100 text-gray-700";
  return "bg-green-100 text-green-700";
}

export function LiabilitiesTable({ rows, onOpenDetail, onSendAck }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-[1200px] w-full text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
          <tr>
            <th className="px-2 py-1">Display ID</th>
            <th className="px-2 py-1">Driver</th>
            <th className="px-2 py-1">Type</th>
            <th className="px-2 py-1">Source</th>
            <th className="px-2 py-1">Original $</th>
            <th className="px-2 py-1">Paid $</th>
            <th className="px-2 py-1">Balance $</th>
            <th className="px-2 py-1">Schedule</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = String(row.display_status ?? "active");
            return (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.id).slice(0, 8)}</td>
                <td className="px-2 py-1">{String(row.driver_full_name ?? "—")}</td>
                <td className="px-2 py-1"><span className={`rounded-full px-2 py-0.5 ${typePill(String(row.type ?? ""))}`}>{String(row.type ?? "type")}</span></td>
                <td className="px-2 py-1">{String(row.source_description ?? "—")}</td>
                <td className="px-2 py-1">${Number(row.original_amount ?? 0).toFixed(2)}</td>
                <td className="px-2 py-1">${Number(row.paid_to_date ?? 0).toFixed(2)}</td>
                <td className="px-2 py-1 font-semibold">${Number(row.current_balance ?? 0).toFixed(2)}</td>
                <td className="px-2 py-1">${Number(row.scheduled_deduction ?? 0).toFixed(2)}</td>
                <td className="px-2 py-1"><span className={`rounded-full px-2 py-0.5 ${statusPill(status)}`}>{status}</span></td>
                <td className="px-2 py-1">
                  <div className="flex gap-2">
                    <button type="button" className="text-blue-700 underline" onClick={() => onOpenDetail(row)}>View Detail</button>
                    {status === "pending_ack" ? (
                      <button type="button" className="text-amber-700 underline" onClick={() => onSendAck(row)}>Send Ack Request</button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr><td colSpan={10} className="px-2 py-3 text-center text-gray-500">No active liabilities.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
