import type { ListsQboSyncHealthRow } from "../../../api/listsHub";

type Props = {
  rows: ListsQboSyncHealthRow[];
  onForceSync: () => void;
  syncing: boolean;
};

function driftClass(value: string) {
  const v = value.toLowerCase();
  if (v === "0") return "text-emerald-700";
  if (v.includes("pend")) return "text-amber-700";
  if (v.includes("drift")) return "text-red-700";
  return "text-slate-600";
}

export function QboSyncHealthCard({ rows, onForceSync, syncing }: Props) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">QBO Sync Health</div>
        <button type="button" onClick={onForceSync} disabled={syncing} className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white">
          {syncing ? "Starting..." : "Force QBO Sync"}
        </button>
      </div>
      <table className="min-w-full text-xs">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="px-2 py-1 text-left">Entity</th>
            <th className="px-2 py-1 text-right">Local</th>
            <th className="px-2 py-1 text-right">QBO</th>
            <th className="px-2 py-1 text-right">Drift</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.entity} className="border-t border-slate-100">
              <td className="px-2 py-1">{row.entity}</td>
              <td className="px-2 py-1 text-right">{row.local_count}</td>
              <td className="px-2 py-1 text-right">{row.qbo_count ?? "—"}</td>
              <td className={`px-2 py-1 text-right font-semibold ${driftClass(row.drift)}`}>{row.drift}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

