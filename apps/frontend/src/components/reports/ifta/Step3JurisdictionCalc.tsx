import { useMemo } from "react";
import type { IftaFiling, IftaFilingJurisdictionRow } from "../../../api/reports-ifta";
import { formatUsd } from "../../../lib/money";
import { ParityTable, type ParityColumn } from "../../parity/ParityTable";

type Props = {
  filing: IftaFiling;
};

function fmtMoney(value: number) {
  return formatUsd(value);
}

function fmtNum(value: number, digits = 3) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function Step3JurisdictionCalc({ filing }: Props) {
  const data = filing.filing_data;
  const rows = data.jurisdiction_rows ?? [];

  const columns = useMemo<ParityColumn<IftaFilingJurisdictionRow>[]>(
    () => [
      { key: "state", label: "State", sortable: true },
      {
        key: "miles",
        label: "Miles",
        sortable: true,
        render: (row) => fmtNum(row.miles, 1),
      },
      {
        key: "fuel_gallons",
        label: "Fuel gal",
        sortable: true,
        render: (row) => fmtNum(row.fuel_gallons, 1),
      },
      {
        key: "tax_rate_per_gallon",
        label: "Rate/gal",
        sortable: true,
        render: (row) => fmtNum(row.tax_rate_per_gallon, 4),
      },
      {
        key: "net_taxable_gallons",
        label: "Net taxable gal",
        sortable: true,
        render: (row) => fmtNum(row.net_taxable_gallons, 2),
      },
      {
        key: "tax_owed",
        label: "Tax owed",
        sortable: true,
        render: (row) => fmtMoney(row.tax_owed),
      },
    ],
    [],
  );

  return (
    <section className="rounded-sm border border-slate-200 bg-white" data-ifta-step="3">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-900">Step 3 · Jurisdiction tax calc</h3>
        <p className="text-xs text-slate-800">
          Rates from{" "}
          <a href={data.rates_source} className="underline" target="_blank" rel="noreferrer">
            IFTA tax matrix ({data.rates_quarter_key})
          </a>
          . Fleet MPG: {data.fleet_mpg != null ? fmtNum(data.fleet_mpg, 2) : "—"}
        </p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.state}
          storageKey="ifta-step3-jurisdiction"
          emptyText="Run preparation to compute jurisdiction taxes."
          initialPageSize={60}
          pageSizeOptions={[15, 50, 60, 100]}
          exportFilename="ifta-jurisdiction-tax"
        />
        {rows.length > 0 ? (
          <div className="flex justify-end rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-900">
            <span className="mr-4">Total net tax</span>
            <span>{fmtMoney(data.total_tax_owed ?? 0)}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
