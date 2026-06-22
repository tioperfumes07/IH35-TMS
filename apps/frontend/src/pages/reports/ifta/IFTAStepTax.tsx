import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIftaPreparation, runIftaCalculateTax } from "../../../api/ifta";

type Props = {
  operatingCompanyId: string;
  preparationId: string;
  quarter: number;
  year: number;
};

function fmtNum(value: number, digits = 2) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtMoney(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function IFTAStepTax({ operatingCompanyId, preparationId, quarter, year }: Props) {
  const queryClient = useQueryClient();
  const prepQuery = useQuery({
    queryKey: ["ifta-preparation", operatingCompanyId, preparationId],
    queryFn: () => getIftaPreparation(operatingCompanyId, preparationId),
    enabled: Boolean(operatingCompanyId && preparationId),
  });

  const runMutation = useMutation({
    mutationFn: () => runIftaCalculateTax(operatingCompanyId, preparationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ifta-preparation", operatingCompanyId, preparationId] });
    },
  });

  const rows = prepQuery.data?.state_taxes ?? [];
  const totalOwed = rows.reduce((sum, row) => sum + Number(row.tax_owed ?? 0), 0);

  return (
    <section className="rounded border border-slate-300 bg-white">
      <div className="border-b border-slate-300 bg-slate-100 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Step 3 · Tax owed (Q{quarter} {year})</h3>
        <p className="text-xs text-slate-700">Per-state IFTA tax using official quarterly rates.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <button
          type="button"
          className="rounded border border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
          disabled={runMutation.isPending}
          onClick={() => void runMutation.mutateAsync()}
        >
          {runMutation.isPending ? "Calculating…" : "Run Step 3 — calculate tax"}
        </button>
        {prepQuery.data?.tax_calculated_at ? (
          <p className="text-slate-600">Last calculated: {new Date(prepQuery.data.tax_calculated_at).toLocaleString()}</p>
        ) : null}
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">State</th>
                <th className="px-2 py-1.5 font-semibold">Miles</th>
                <th className="px-2 py-1.5 font-semibold">Taxable gal</th>
                <th className="px-2 py-1.5 font-semibold">Paid gal</th>
                <th className="px-2 py-1.5 font-semibold">Net gal</th>
                <th className="px-2 py-1.5 font-semibold">Rate</th>
                <th className="px-2 py-1.5 font-semibold">Tax/Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-3 text-slate-500">
                    No tax rows yet — run Step 3 after Steps 1+2.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.state} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium">{row.state}</td>
                  <td className="px-2 py-1.5">{fmtNum(Number(row.miles_in_state ?? 0), 1)}</td>
                  <td className="px-2 py-1.5">{fmtNum(Number(row.taxable_gallons ?? 0), 1)}</td>
                  <td className="px-2 py-1.5">{fmtNum(Number(row.gallons_purchased_in_state ?? 0), 1)}</td>
                  <td className="px-2 py-1.5">{fmtNum(Number(row.net_taxable_gallons ?? 0), 1)}</td>
                  <td className="px-2 py-1.5">{fmtNum(Number(row.tax_rate_per_gallon ?? 0), 3)}</td>
                  <td className={`px-2 py-1.5 ${Number(row.tax_owed) < 0 ? "text-green-700" : ""}`}>{fmtMoney(Number(row.tax_owed ?? 0))}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td colSpan={6} className="px-2 py-1.5">
                    Total net tax
                  </td>
                  <td className="px-2 py-1.5">{fmtMoney(totalOwed)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </section>
  );
}
