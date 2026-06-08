import type { IftaFiling } from "../../../api/reports-ifta";

type Props = {
  filing: IftaFiling;
};

function fmtMoney(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtNum(value: number, digits = 3) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function Step3JurisdictionCalc({ filing }: Props) {
  const data = filing.filing_data;
  const rows = data.jurisdiction_rows ?? [];

  return (
    <section className="rounded border border-amber-200 bg-white" data-ifta-step="3">
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Step 3 · Jurisdiction tax calc</h3>
        <p className="text-xs text-amber-800">
          Rates from{" "}
          <a href={data.rates_source} className="underline" target="_blank" rel="noreferrer">
            IFTA tax matrix ({data.rates_quarter_key})
          </a>
          . Fleet MPG: {data.fleet_mpg != null ? fmtNum(data.fleet_mpg, 2) : "—"}
        </p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">State</th>
                <th className="px-2 py-1.5 font-semibold">Miles</th>
                <th className="px-2 py-1.5 font-semibold">Fuel gal</th>
                <th className="px-2 py-1.5 font-semibold">Rate/gal</th>
                <th className="px-2 py-1.5 font-semibold">Net taxable gal</th>
                <th className="px-2 py-1.5 font-semibold">Tax owed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-3 text-slate-500">
                    Run preparation to compute jurisdiction taxes.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.state} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium">{row.state}</td>
                  <td className="px-2 py-1.5">{fmtNum(row.miles, 1)}</td>
                  <td className="px-2 py-1.5">{fmtNum(row.fuel_gallons, 1)}</td>
                  <td className="px-2 py-1.5">{fmtNum(row.tax_rate_per_gallon, 4)}</td>
                  <td className="px-2 py-1.5">{fmtNum(row.net_taxable_gallons, 2)}</td>
                  <td className="px-2 py-1.5">{fmtMoney(row.tax_owed)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td colSpan={5} className="px-2 py-1.5 text-right">
                    Total net tax
                  </td>
                  <td className="px-2 py-1.5">{fmtMoney(data.total_tax_owed ?? 0)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </section>
  );
}
