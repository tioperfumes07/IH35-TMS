import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDispatchOptimalDrivers, type OptimalDriverRow } from "../../api/dispatch";
import { readDispatchLocalSettings, type DispatchLocalSettings } from "../../lib/dispatch-local-settings";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

export type OptimalDriversPanelProps = {
  loadId: string;
  operatingCompanyId: string;
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
  onSelectedDriverLabelChange?: (label: string | null) => void;
  /** Book-load preview when load row does not exist yet. */
  preview?: {
    pickup_city?: string;
    pickup_state?: string;
    hazmat?: boolean;
    trailer_type?: string;
  };
  /** Test / storybook override */
  driversOverride?: OptimalDriverRow[];
  /** Test / storybook override for the selected-company settings snapshot. */
  routingSettingsOverride?: DispatchLocalSettings;
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
  onSelectedDriverLabelChange,
  preview,
  driversOverride,
  routingSettingsOverride,
  disabled,
}: OptimalDriversPanelProps) {
  const [manualOverride, setManualOverride] = useState(false);
  const routingSettings = routingSettingsOverride ?? readDispatchLocalSettings(operatingCompanyId);

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
    enabled: Boolean(routingSettings.auto_routing_enabled && loadId && operatingCompanyId && driversOverride == null),
  });

  if (!routingSettings.auto_routing_enabled) return null;

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
    <div className="space-y-2 rounded-sm border border-slate-200 bg-slate-50 p-3" data-testid="optimal-drivers-panel">
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
      {q.isError && !driversOverride ? (
        <ListErrorState status={0} message="Could not load optimizer rankings." onRetry={() => void q.refetch()} />
      ) : null}

      {!q.isError || driversOverride ? <ul className="max-h-48 space-y-1 overflow-y-auto">
        {drivers.map((d) => {
          const selected = selectedDriverId === d.driver_id;
          const blockedByHos = routingSettings.auto_routing_respect_hos && !d.hos_safe;
          const blockedByEquipment = routingSettings.auto_routing_respect_equipment && !d.eligible;
          const blocked = !manualOverride && (blockedByHos || blockedByEquipment);
          const rowDisabled = Boolean(disabled || blocked);
          return (
            <li key={d.driver_id}>
              <div
                role="button"
                tabIndex={rowDisabled ? -1 : 0}
                aria-disabled={rowDisabled}
                data-testid={`optimal-driver-row-${d.rank}`}
                className={`flex w-full flex-col px-2 py-1.5 text-left text-xs transition ${
                  selected ? "bg-slate-100" : "bg-white hover:bg-slate-50"
                } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() => {
                  if (!rowDisabled) {
                    onSelectedDriverLabelChange?.(d.display_name);
                    onSelectDriver(d.driver_id);
                  }
                }}
                onKeyDown={(event) => {
                  if (!rowDisabled && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onSelectedDriverLabelChange?.(d.display_name);
                    onSelectDriver(d.driver_id);
                  }
                }}
              >
                <span className="flex items-center justify-between gap-2 font-semibold text-slate-800">
                  <span>
                    #{d.rank} ·{" "}
                    {/* Exact Leaves dispatch.panel.optimal_drivers:driver — ranked rows were
                        plain display_name text; expose a real driver EntityLink (stopPropagation
                        so profile hop does not force-select the row). */}
                    <span
                      data-testid={`optimal-driver-entitylink-${d.rank}`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <EntityLink
                        kind="driver"
                        id={d.driver_id}
                        label={entityLabel(d.display_name, d.driver_id, "Driver")}
                      />
                    </span>
                    {!d.hos_safe ? " · HOS risk" : ""}
                  </span>
                  <span className="font-mono text-[11px] text-slate-700">{fmtScore(d.total_score)} pts</span>
                </span>
                <span className="text-[10px] text-slate-500">{breakdownLabel(d)}</span>
                {blockedByHos ? <span className="text-[10px] text-slate-700">Insufficient HOS for estimated drive</span> : null}
                {routingSettings.auto_routing_respect_equipment && d.ineligible_reason ? <span className="text-[10px] text-slate-700">{d.ineligible_reason}</span> : null}
              </div>
            </li>
          );
        })}
      </ul> : null}

      {showOverrideWarning ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-2 text-[11px] text-slate-700">
          Selected driver is not the top-ranked suggestion. Enable <strong>Manual override</strong> to confirm a non-optimal pick.
        </div>
      ) : null}
    </div>
  );
}
