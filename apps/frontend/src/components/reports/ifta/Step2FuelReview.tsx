import { useState } from "react";
import type { IftaFiling } from "../../../api/reports-ifta";

type Props = {
  filing: IftaFiling;
  onSaveOverrides: (overrides: Record<string, number>) => Promise<void>;
  saving?: boolean;
};

function fmtNum(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function Step2FuelReview({ filing, onSaveOverrides, saving }: Props) {
  const data = filing.filing_data;
  const states = [
    ...new Set([
      ...Object.keys(data.fuel_by_jurisdiction ?? {}),
      ...Object.keys(data.fuel_overrides ?? {}),
    ]),
  ].sort();

  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const state of states) {
      const value = data.fuel_overrides?.[state] ?? data.fuel_by_jurisdiction?.[state] ?? 0;
      initial[state] = String(value);
    }
    return initial;
  });

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
    <section className="rounded border border-amber-200 bg-white" data-ifta-step="2">
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Step 2 · Fuel review</h3>
        <p className="text-xs text-amber-800">Per-jurisdiction fuel purchased from fuel card transactions.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">State</th>
                <th className="px-2 py-1.5 font-semibold">Aggregated gallons</th>
                <th className="px-2 py-1.5 font-semibold">Override gallons</th>
              </tr>
            </thead>
            <tbody>
              {states.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-slate-500">
                    No fuel data for this quarter.
                  </td>
                </tr>
              ) : null}
              {states.map((state) => (
                <tr key={state} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium">{state}</td>
                  <td className="px-2 py-1.5">{fmtNum(Number(data.fuel_by_jurisdiction?.[state] ?? 0))}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      className="w-28 rounded border border-slate-300 px-2 py-1"
                      value={draftOverrides[state] ?? ""}
                      onChange={(event) =>
                        setDraftOverrides((prev) => ({ ...prev, [state]: event.target.value }))
                      }
                      data-testid={`ifta-fuel-override-${state}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            {states.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-2 py-1.5">Total</td>
                  <td colSpan={2} className="px-2 py-1.5">
                    {fmtNum(total)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        <button
          type="button"
          className="rounded border border-amber-400 bg-amber-100 px-3 py-1.5 font-semibold text-amber-900 disabled:opacity-50"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save fuel overrides"}
        </button>
      </div>
    </section>
  );
}
