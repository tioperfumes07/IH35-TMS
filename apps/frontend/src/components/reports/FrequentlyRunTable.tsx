import type { FrequentlyRunReport } from "../../api/reports";

type Props = {
  rows: FrequentlyRunReport[];
  onRun: (row: FrequentlyRunReport) => void;
};

export function FrequentlyRunTable({ rows, onRun }: Props) {
  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Frequently run</h3>
        {/* Removed dead "View all" href="#" link — this table already lives on the reports
            landing; there is no separate all-reports destination (QA-sweep). */}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500">
              <th className="px-3 py-2 font-semibold">Report</th>
              <th className="px-3 py-2 font-semibold">Filters</th>
              <th className="px-3 py-2 font-semibold">Runs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onRun(row)} className="text-left font-semibold text-slate-800 hover:text-[#1f2a44] hover:underline">
                    {row.name}
                  </button>
                  {row.status === "stub" ? (
                    <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {row.id === "ar-aging" ? "P5" : "P4"}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-slate-600">{row.filters}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">{row.runs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
