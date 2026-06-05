import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIftaPreparation, runIftaAggregateGallons } from "../../../api/ifta";

type Props = {
  operatingCompanyId: string;
  preparationId: string;
  quarter: number;
  year: number;
};

function fmtNum(value: number, digits = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function IFTAStepGallons({ operatingCompanyId, preparationId, quarter, year }: Props) {
  const queryClient = useQueryClient();
  const prepQuery = useQuery({
    queryKey: ["ifta-preparation", operatingCompanyId, preparationId],
    queryFn: () => getIftaPreparation(operatingCompanyId, preparationId),
    enabled: Boolean(operatingCompanyId && preparationId),
  });

  const runMutation = useMutation({
    mutationFn: () => runIftaAggregateGallons(operatingCompanyId, preparationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ifta-preparation", operatingCompanyId, preparationId] });
    },
  });

  const rows = prepQuery.data?.state_gallons ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.override_gallons ?? row.gallons ?? 0), 0);

  return (
    <section className="rounded border border-emerald-200 bg-white">
      <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Step 2 · State gallons (Q{quarter} {year})</h3>
        <p className="text-xs text-emerald-800">Relay → Loves upload → dispatch fuel records with dedupe.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <button
          type="button"
          className="rounded border border-emerald-400 bg-emerald-100 px-3 py-1.5 font-semibold text-emerald-900 disabled:opacity-50"
          disabled={runMutation.isPending}
          onClick={() => void runMutation.mutateAsync()}
        >
          {runMutation.isPending ? "Aggregating…" : "Run Step 2 — aggregate gallons"}
        </button>
        {prepQuery.data?.gallons_aggregated_at ? (
          <p className="text-slate-600">Last aggregated: {new Date(prepQuery.data.gallons_aggregated_at).toLocaleString()}</p>
        ) : null}
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">State</th>
                <th className="px-2 py-1.5 font-semibold">Gallons</th>
                <th className="px-2 py-1.5 font-semibold">Source</th>
                <th className="px-2 py-1.5 font-semibold">Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-3 text-slate-500">
                    No gallons aggregated yet — run Step 2.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.state} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium">{row.state}</td>
                  <td className="px-2 py-1.5">{fmtNum(Number(row.override_gallons ?? row.gallons ?? 0))}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.source}</td>
                  <td className="px-2 py-1.5 text-slate-500">
                    {Array.isArray(row.source_records)
                      ? row.source_records.map((rec) => `${rec.source}: ${fmtNum(Number(rec.gallons ?? 0), 2)}`).join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-2 py-1.5">Total</td>
                  <td className="px-2 py-1.5">{fmtNum(total)}</td>
                  <td className="px-2 py-1.5" colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </section>
  );
}
