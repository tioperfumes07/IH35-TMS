import { Link } from "react-router-dom";
import type { ScheduledReport } from "../../api/reports";

type Props = {
  rows: ScheduledReport[];
};

export function ScheduledReportsPanel({ rows }: Props) {
  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Scheduled auto-emailed</h3>
        <Link to="/reports/scheduled" className="text-xs font-semibold text-[#1f2a44] hover:underline">
          Manage
        </Link>
      </div>
      <div className="space-y-2 px-3 py-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded border border-slate-100 bg-slate-50 p-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">{row.cadence}</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-800">{row.name}</div>
            <div className="text-xs text-slate-600">{row.recipients}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
