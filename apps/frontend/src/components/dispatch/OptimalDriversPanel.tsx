import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDispatchOptimalDrivers, type OptimalDriverRow } from "../../api/dispatch";

export type OptimalDriversPanelProps = {
  loadId: string;
  operatingCompanyId: string;
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
  /** Book-load preview when load row does not exist yet. */
  preview?: {
    pickup_city?: string;
    pickup_state?: string;
    hazmat?: boolean;
    trailer_type?: string;
  };
  /** Test / storybook override */
  driversOverride?: OptimalDriverRow[];
  disabled?: boolean;
};

function fmtScore(n: number) {
  return Number.isFinite(n) ? n.toFixed(0) : "—";
}

export function OptimalDriversPanel({
  loadId,
  operatingCompanyId,
  selectedDriverId,
  onSelectDriver,
  preview,
  driversOverride,
  disabled,
}: OptimalDriversPanelProps) {
  const [manualOverride, setManualOverride] = useState(false);

  const q = useQuery({
    queryKey: [
      "dispatch",
      "optimal-drivers",
      loadId,
      operatingCompanyId,
      preview?.pickup_city ?? "",
      preview?.pickup_state ?? "",
      preview?.hazmat ?? false,
      preview?.trailer_type ?? "",
    ],
    queryFn: () =>
      getDispatchOptimalDrivers({
        load_id: loadId,
        operating_company_id: operatingCompanyId,
        preview_pickup_city: preview?.pickup_city,
        preview_pickup_state: preview?.pickup_state,
        preview_hazmat: preview?.hazmat,
        preview_trailer_type: preview?.trailer_type,
      }),
    enabled: Boolean(loadId && operatingCompanyId && driversOverride == null),
  });

  const drivers = driversOverride ?? q.data?.drivers ?? [];
  const topPick = drivers.find((d) => d.rank === 1) ?? drivers[0];
  const showOverrideWarning =
    Boolean(selectedDriverId && topPick && selectedDriverId !== topPick.driver_id && !manualOverride);

  const breakdownLabel = useMemo(
    () => (d: OptimalDriverRow) =>
      `HOS ${fmtScore(d.breakdown.hos_score)} · Prox ${fmtScore(d.breakdown.proximity_score)} · Elig ${fmtScore(d.breakdown.eligibility_score)} · Perf ${fmtScore(d.breakdown.performance_score)} · DH −${fmtScore(d.breakdown.deadhead_penalty)}`,
    []
  );

  return (
    <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3" data-testid="optimal-drivers-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Ranked driver suggestions</p>
          <p className="text-[11px] text-slate-500">Top 10 by HOS, proximity, eligibility, and recent performance</p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={manualOverride}
            disabled={disabled}
            onChange={(e) => setManualOverride(e.target.checked)}
            data-testid="optimal-drivers-override"
          />
          Manual override
        </label>
      </div>

      {q.isLoading && !driversOverride ? <p className="text-xs text-slate-500">Loading ranked drivers…</p> : null}
      {q.isError && !driversOverride ? <p className="text-xs text-red-600">Could not load optimizer rankings.</p> : null}

      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {drivers.map((d) => {
          const selected = selectedDriverId === d.driver_id;
          const blocked = !manualOverride && !d.eligible;
          return (
            <li key={d.driver_id}>
              <button
                type="button"
                disabled={disabled || blocked}
                data-testid={`optimal-driver-row-${d.rank}`}
                className={`flex w-full flex-col rounded border px-2 py-1.5 text-left text-xs transition ${
                  selected ? "border-slate-300 bg-slate-100" : "border-slate-200 bg-white hover:border-slate-300"
                } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() => onSelectDriver(d.driver_id)}
              >
                <span className="flex items-center justify-between gap-2 font-semibold text-slate-800">
                  <span>
                    #{d.rank} · {d.display_name}
                    {!d.hos_safe ? " · HOS risk" : ""}
                  </span>
                  <span className="font-mono text-[11px] text-slate-700">{fmtScore(d.total_score)} pts</span>
                </span>
                <span className="text-[10px] text-slate-500">{breakdownLabel(d)}</span>
                {d.ineligible_reason ? <span className="text-[10px] text-amber-700">{d.ineligible_reason}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {showOverrideWarning ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          Selected driver is not the top-ranked suggestion. Enable <strong>Manual override</strong> to confirm a non-optimal pick.
        </div>
      ) : null}
    </div>
  );
}
