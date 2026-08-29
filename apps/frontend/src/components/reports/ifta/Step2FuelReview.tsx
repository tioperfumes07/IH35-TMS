import { useMemo, useState } from "react";
import type { IftaFiling } from "../../../api/reports-ifta";
import { ParityTable, type ParityColumn } from "../../parity/ParityTable";

type Props = {
  filing: IftaFiling;
  onSaveOverrides: (overrides: Record<string, number>) => Promise<void>;
  saving?: boolean;
};

type FuelRow = {
  state: string;
  aggregated: number;
  override: string;
};

function fmtNum(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function Step2FuelReview({ filing, onSaveOverrides, saving }: Props) {
  const data = filing.filing_data;
  const states = useMemo(
    () =>
      [
        ...new Set([
          ...Object.keys(data.fuel_by_jurisdiction ?? {}),
          ...Object.keys(data.fuel_overrides ?? {}),
        ]),
      ].sort(),
    [data.fuel_by_jurisdiction, data.fuel_overrides],
  );

  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const state of states) {
      const value = data.fuel_overrides?.[state] ?? data.fuel_by_jurisdiction?.[state] ?? 0;
      initial[state] = String(value);
    }
    return initial;
  });

  const rows = useMemo<FuelRow[]>(
    () =>
      states.map((state) => ({
        state,
        aggregated: Number(data.fuel_by_jurisdiction?.[state] ?? 0),
        override: draftOverrides[state] ?? "",
      })),
    [states, data.fuel_by_jurisdiction, draftOverrides],
  );

  const columns = useMemo<ParityColumn<FuelRow>[]>(
    () => [
      {
        key: "state",
        label: "State",
        sortable: true,
        cellClass: "font-medium",
      },
      {
        key: "aggregated",
        label: "Aggregated gallons",
        sortable: true,
        render: (row) => fmtNum(row.aggregated),
      },
      {
        key: "override",
        label: "Override gallons",
        sortable: true,
        sortValue: (row) => Number(row.override),
        render: (row) => (
          <input
            type="number"
            min={0}
            step="0.1"
            className="w-28 rounded-sm border border-slate-300 px-2 py-1"
            value={draftOverrides[row.state] ?? ""}
            onChange={(event) =>
              setDraftOverrides((prev) => ({ ...prev, [row.state]: event.target.value }))
            }
            data-testid={`ifta-fuel-override-${row.state}`}
          />
        ),
      },
    ],
    [draftOverrides],
  );

  const save = async () => {
    const fuel_overrides: Record<string, number> = {};
    for (const [state, raw] of Object.entries(draftOverrides)) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) continue;
      const baseline = data.fuel_by_jurisdiction?.[state] ?? 0;
      if (parsed !== baseline) fuel_overrides[state] = parsed;
    }
    await onSaveOverrides(fuel_overrides);
  };

  const total = states.reduce((sum, state) => sum + Number(draftOverrides[state] ?? 0), 0);

  return (
    <section className="rounded-sm border border-slate-200 bg-white" data-ifta-step="2">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-900">Step 2 · Fuel review</h3>
        <p className="text-xs text-slate-800">Per-jurisdiction fuel purchased from fuel card transactions.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.state}
          storageKey="ifta-step2-fuel"
          emptyText="No fuel data for this quarter."
          initialPageSize={60}
          pageSizeOptions={[15, 50, 60, 100]}
          exportFilename="ifta-fuel-review"
          tableTestId="ifta-step2-fuel-table"
          rowTestId={(row) => `ifta-step2-fuel-row-${row.state}`}
        />
        {states.length > 0 ? (
          <div className="flex justify-end rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-900">
            <span className="mr-4">Total</span>
            <span>{fmtNum(total)}</span>
          </div>
        ) : null}
        <button
          type="button"
          className="rounded-sm border border-slate-400 bg-slate-100 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-50"
          disabled={saving}
          onClick={() => {
            // GO-0028: the parent mutation's onError already surfaces a toast; .catch() here
            // only prevents an unhandled-promise-rejection from this fire-and-forget click.
            void save().catch(() => {});
          }}
        >
          {saving ? "Saving…" : "Save fuel overrides"}
        </button>
      </div>
    </section>
  );
}
