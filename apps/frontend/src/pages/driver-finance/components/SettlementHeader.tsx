import { EntityLink } from "../../../components/shared/EntityLink";
import { formatDateUS } from "../../../lib/formatDate";

type Props = {
  driverId: string | null;
  driverName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  computedAt: string | null;
  /** Loads this settlement covers. `number` is the human load number; `id` is only the drill target.
   *  A null `number` means the payload genuinely did not carry one — it is NOT a licence to print a uuid
   *  by default (SETTLEMENT-DETAIL-SHOWS-RAW-UUID). */
  loads: { id: string; number: string | null }[];
  onRefresh: () => void;
};

export function SettlementHeader({
  driverId,
  driverName,
  periodStart,
  periodEnd,
  status,
  computedAt,
  loads,
  onRefresh,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-sm border border-gray-200 bg-white p-3 lg:grid-cols-4">
      <div>
        <div className="text-[10px] uppercase text-gray-500">Driver</div>
        <div className="text-sm font-semibold">
          <EntityLink kind="driver" id={driverId} label={driverName} />
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-gray-500">Settlement Period</div>
        <div className="text-sm font-semibold">
          {formatDateUS(periodStart)} — {formatDateUS(periodEnd)}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-gray-500">Loads in cycle</div>
        <div className="text-sm">
          {loads.length === 0 ? (
            "—"
          ) : (
            <div className="flex flex-wrap gap-1">
              {/* SETTLEMENT-DETAIL-SHOWS-RAW-UUID: show load number; truncated id only when number missing. */}
              {loads.map((load) => (
                <EntityLink key={load.id} kind="load" id={load.id} label={load.number ?? load.id.slice(0, 8)} className="text-slate-700 hover:underline" />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase text-gray-500">Status</div>
        <div className="text-sm font-semibold">{status}</div>
        <div className="mt-1 text-[10px] text-gray-500">Recompute: {computedAt ? formatDateUS(computedAt) : "n/a"}</div>
        <button type="button" className="mt-1 text-xs text-slate-700 underline" onClick={onRefresh}>Refresh</button>
      </div>
    </div>
  );
}
