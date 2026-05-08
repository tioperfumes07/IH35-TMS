import type { FrequentlyRunReport } from "../../api/reports";

type Props = {
  rows: FrequentlyRunReport[];
};

export function FrequentlyRunTable({ rows }: Props) {
  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Frequently run</h3>
        <a href="#" className="text-xs font-semibold text-[#1f2a44] hover:underline">
          View all 68
        </a>
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
                  <button type="button" className="text-left font-semibold text-slate-800 hover:text-[#1f2a44] hover:underline">
                    {row.name}
                  </button>
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
