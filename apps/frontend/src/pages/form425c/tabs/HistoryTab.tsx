import type { HistoryReportRow } from "../types";

type Props = {
  reports: HistoryReportRow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onAmend: (id: string) => void;
};

function periodLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function HistoryTab({ reports, loading, onOpen, onAmend }: Props) {
  return (
    <div className="space-y-3 p-4">
      <div className="rounded border bg-white">
        <div className="border-b bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Filing History</div>
        {loading ? <div className="p-3 text-sm text-slate-500">Loading reports...</div> : null}
        {!loading && !reports.length ? <div className="p-3 text-sm text-slate-500">No reports found.</div> : null}
        {reports.length ? (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Reporting Month</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Filed Date</th>
                <th className="px-3 py-2 text-left">Amended?</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{periodLabel(r.reporting_month)}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{r.filed_at ? new Date(r.filed_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">{r.amended_from_uuid ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="mr-2 rounded border px-2 py-1 text-xs" onClick={() => onOpen(r.id)}>
                      Open
                    </button>
                    {r.status === "filed" ? (
                      <button type="button" className="rounded bg-slate-800 px-2 py-1 text-xs text-white" onClick={() => onAmend(r.id)}>
                        Amend
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

