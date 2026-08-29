import { useMemo, useState } from "react";
import type { IftaFiling } from "../../../api/reports-ifta";
import { ParityTable, type ParityColumn } from "../../parity/ParityTable";

type Props = {
  filing: IftaFiling;
  onSaveOverrides: (overrides: Record<string, number>) => Promise<void>;
  saving?: boolean;
};

type MileageRow = {
  state: string;
  aggregatedMiles: number;
};

function fmtNum(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function Step1MileageReview({ filing, onSaveOverrides, saving }: Props) {
  const data = filing.filing_data;
  const states = useMemo(
    () =>
      [
        ...new Set([
          ...Object.keys(data.miles_by_jurisdiction ?? {}),
          ...Object.keys(data.miles_overrides ?? {}),
        ]),
      ].sort(),
    [data.miles_by_jurisdiction, data.miles_overrides],
  );

  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const state of states) {
      const value = data.miles_overrides?.[state] ?? data.miles_by_jurisdiction?.[state] ?? 0;
      initial[state] = String(value);
    }
    return initial;
  });

  const rows = useMemo<MileageRow[]>(
    () =>
      states.map((state) => ({
        state,
        aggregatedMiles: Number(data.miles_by_jurisdiction?.[state] ?? 0),
      })),
    [states, data.miles_by_jurisdiction],
  );

  const columns: Array<ParityColumn<MileageRow>> = useMemo(
    () => [
      {
        key: "state",
        label: "State",
        sortable: true,
        alwaysVisible: true,
        cellClass: "font-medium",
        render: (row) => row.state,
      },
      {
        key: "aggregatedMiles",
        label: "Aggregated miles",
        sortable: true,
        sortValue: (row) => row.aggregatedMiles,
        render: (row) => fmtNum(row.aggregatedMiles),
      },
      {
        key: "overrideMiles",
        label: "Override miles",
        sortable: false,
        alwaysVisible: true,
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
            data-testid={`ifta-miles-override-${row.state}`}
          />
        ),
      },
    ],
    [draftOverrides],
  );

  const save = async () => {
    const miles_overrides: Record<string, number> = {};
    for (const [state, raw] of Object.entries(draftOverrides)) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) continue;
      const baseline = data.miles_by_jurisdiction?.[state] ?? 0;
      if (parsed !== baseline) miles_overrides[state] = parsed;
    }
    await onSaveOverrides(miles_overrides);
  };

  const total = states.reduce((sum, state) => sum + Number(draftOverrides[state] ?? 0), 0);

  return (
    <section className="rounded-sm border border-slate-200 bg-white" data-ifta-step="1">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-900">Step 1 · Mileage review</h3>
        <p className="text-xs text-slate-800">Per-jurisdiction miles from dispatch loads + state crossings. Override when needed.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.state}
          storageKey="ifta-step1-mileage-review"
          emptyText="No mileage data for this quarter."
          density="compact"
          tableTestId="ifta-step1-mileage-table"
          initialPageSize={100}
          pageSizeOptions={[15, 50, 100, 300]}
        />
        {states.length > 0 ? (
          <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 font-semibold text-slate-900">
            Total: {fmtNum(total)}
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
          {saving ? "Saving…" : "Save mileage overrides"}
        </button>
      </div>
    </section>
  );
}
