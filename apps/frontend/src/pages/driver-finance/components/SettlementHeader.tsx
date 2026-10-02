import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";

type Props = {
  settlementId?: string | null;
  settlementDisplayId?: string | null;
  driverId: string | null;
  driverName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  computedAt: string | null;
  /** Loads this settlement covers. `number` is the human load number; `id` is only the drill target.
   *  A null `number` means the payload genuinely did not carry one — it is NOT a licence to print a uuid
   *  by default (SETTLEMENT-DETAIL-SHOWS-RAW-UUID). */
  loadIds: { id: string; number: string | null }[];
  /** Lead ROUND 330.6: the reversed settlement this one replaces, and the settlement that replaced this one. */
  predecessor?: { id: string; label: string | null } | null;
  successor?: { id: string; label: string | null } | null;
  onRefresh: () => void;
};

export function SettlementHeader({
  settlementId,
  settlementDisplayId,
  driverId,
  driverName,
  periodStart,
  periodEnd,
  status,
  computedAt,
  loadIds,
  predecessor,
  successor,
  onRefresh,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-sm border border-gray-200 bg-white p-3 lg:grid-cols-5">
      {settlementId || settlementDisplayId ? (
        <div>
          <div className="text-[11px] uppercase text-gray-500">Settlement No</div>
          <div className="text-xs font-semibold">
            {settlementId ? (
              <EntityLink
                kind="settlement"
                id={settlementId}
                label={entityLabel(settlementDisplayId, settlementId, "Settlement")}
                data-testid="settlement-header-settlement-link"
              />
            ) : (
              settlementDisplayId
            )}
          </div>
        </div>
      ) : null}
      {predecessor ? (
        <div data-testid="settlement-header-predecessor">
          <div className="text-[11px] uppercase text-gray-500">Replaces (reversed)</div>
          <div className="text-xs font-semibold">
            <EntityLink kind="settlement" id={predecessor.id} label={entityLabel(predecessor.label, predecessor.id, "Settlement")} />
          </div>
        </div>
      ) : null}
      {successor ? (
        <div data-testid="settlement-header-successor">
          <div className="text-[11px] uppercase text-gray-500">Replaced by</div>
          <div className="text-xs font-semibold">
            <EntityLink kind="settlement" id={successor.id} label={entityLabel(successor.label, successor.id, "Settlement")} />
          </div>
        </div>
      ) : null}
      <div>
        <div className="text-[11px] uppercase text-gray-500">Driver</div>
        <div className="text-xs font-semibold">
          <EntityLink kind="driver" id={driverId} label={entityLabel(driverName, driverId, "Driver")} />
        </div>
      </div>
      {/* COL-06: both dates were already rendered here, just under one collapsed "Settlement
          Period" label instead of the canonical Period Begin / Period End contract
          (components/dispatch/LoadDetailSettlementTab.tsx) -- split for consistency. */}
      <div>
        <div className="text-[11px] uppercase text-gray-500">Period Begin</div>
        <div className="text-xs font-semibold">{formatDateUS(periodStart)}</div>
      </div>
      <div>
        <div className="text-[11px] uppercase text-gray-500">Period End</div>
        <div className="text-xs font-semibold">{formatDateUS(periodEnd)}</div>
      </div>
      <div>
        <div className="text-[11px] uppercase text-gray-500">Loads in cycle</div>
        <div className="text-xs">
          {loadIds.length === 0 ? (
            "—"
          ) : (
            <div className="flex flex-wrap gap-1">
              {/* LST-F113 / SETTLEMENT-DETAIL-SHOWS-RAW-UUID: load number or honest "Load — not visible" — never UUID slice. */}
              {loadIds.map((load) => (
                <EntityLink
                  key={load.id}
                  kind="load"
                  id={load.id}
                  label={entityLabel(load.number, load.id, "Load")}
                  className="text-slate-700 hover:underline"
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] uppercase text-gray-500">Status</div>
        <div className="text-xs font-semibold">{status}</div>
        <div className="mt-1 text-xs text-gray-500">Recompute: {computedAt ? formatDateUS(computedAt) : "n/a"}</div>
        <button type="button" className="mt-1 text-xs text-slate-700 underline" onClick={onRefresh}>Refresh</button>
      </div>
    </div>
  );
}
