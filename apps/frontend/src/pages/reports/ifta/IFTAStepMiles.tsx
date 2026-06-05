import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIftaPreparation, runIftaAggregateMiles } from "../../../api/ifta";

type Props = {
  operatingCompanyId: string;
  preparationId: string;
  quarter: number;
  year: number;
};

function fmtNum(value: number, digits = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function IFTAStepMiles({ operatingCompanyId, preparationId, quarter, year }: Props) {
  const queryClient = useQueryClient();
  const prepQuery = useQuery({
    queryKey: ["ifta-preparation", operatingCompanyId, preparationId],
    queryFn: () => getIftaPreparation(operatingCompanyId, preparationId),
    enabled: Boolean(operatingCompanyId && preparationId),
  });

  const runMutation = useMutation({
    mutationFn: () => runIftaAggregateMiles(operatingCompanyId, preparationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ifta-preparation", operatingCompanyId, preparationId] });
    },
  });

  const rows = prepQuery.data?.state_miles ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.override_miles ?? row.miles ?? 0), 0);

  return (
    <section className="rounded border border-amber-200 bg-white">
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Step 1 · State miles (Q{quarter} {year})</h3>
        <p className="text-xs text-amber-800">Pulled from Samsara vehicle state miles with load-stop fallback.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <button
          type="button"
          className="rounded border border-amber-400 bg-amber-100 px-3 py-1.5 font-semibold text-amber-900 disabled:opacity-50"
          disabled={runMutation.isPending}
          onClick={() => void runMutation.mutateAsync()}
        >
          {runMutation.isPending ? "Aggregating…" : "Run Step 1 — aggregate miles"}
        </button>
        {prepQuery.data?.miles_aggregated_at ? (
          <p className="text-slate-600">Last aggregated: {new Date(prepQuery.data.miles_aggregated_at).toLocaleString()}</p>
        ) : null}
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">State</th>
                <th className="px-2 py-1.5 font-semibold">Miles</th>
                <th className="px-2 py-1.5 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-slate-500">
                    No miles aggregated yet — run Step 1.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.state} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium">{row.state}</td>
                  <td className="px-2 py-1.5">{fmtNum(Number(row.override_miles ?? row.miles ?? 0))}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.source}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-2 py-1.5">Total</td>
                  <td className="px-2 py-1.5">{fmtNum(total)}</td>
                  <td className="px-2 py-1.5" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </section>
  );
}
