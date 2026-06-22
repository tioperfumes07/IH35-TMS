import type { SettlementListRow } from "../../../api/driverFinance";

type Props = {
  rows: SettlementListRow[];
  onOpen: (id: string) => void;
};

function statusClass(status: SettlementListRow["status"]) {
  if (status === "paid") return "bg-green-100 text-green-700";
  if (status === "locked") return "bg-slate-100 text-slate-700";
  if (status === "held") return "bg-amber-100 text-amber-700";
  if (status === "cancelled") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

export function SettlementsTable({ rows, onOpen }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-[1100px] w-full text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
          <tr>
            {["Driver", "Period", "Loads", "Gross", "Deductions", "Net Pay", "Status", "Debt Flag", "Action"].map((h) => (
              <th key={h} className="px-2 py-1">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-2 py-1">
                <div className="font-semibold">{row.driver_full_name}</div>
                <div className="text-[10px] text-gray-500">{row.driver_display_id}</div>
              </td>
              <td className="px-2 py-1">{row.period_start} → {row.period_end}</td>
              <td className="px-2 py-1">—</td>
              <td className="px-2 py-1">${Number(row.gross_pay ?? 0).toFixed(2)}</td>
              <td className="px-2 py-1">${Number(row.deductions_total ?? 0).toFixed(2)}</td>
              <td className="px-2 py-1 font-semibold text-green-700">${Number(row.net_pay ?? 0).toFixed(2)}</td>
              <td className="px-2 py-1"><span className={`rounded-full px-2 py-0.5 ${statusClass(row.status)}`}>{row.status}</span></td>
              <td className="px-2 py-1">
                {typeof row.live_debt_flag === "number" && row.live_debt_flag > 0 ? (
                  <span className="font-semibold text-red-700">${row.live_debt_flag.toFixed(2)}</span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </td>
              <td className="px-2 py-1">
                <button type="button" className="text-slate-700 underline" onClick={() => onOpen(row.id)}>
                  Open →
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-2 py-3 text-center text-gray-500">No settlements found.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
