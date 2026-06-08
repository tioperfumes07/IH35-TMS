import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DispatchLoadRow } from "../../api/loads";
import { listOpenPreSettlements } from "../../api/driverFinance";
import { listUnitsWithoutLoad } from "../../api/dispatch";
import { FLAG_EMOJI_BY_CODE, STATUS_LABEL, formatMoneyCents, toRouteSummary } from "../../components/dispatch/constants";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import type { DataTableErrorState } from "../../lib/tableError";

const ACTIVE_STATUSES = new Set([
  "assigned",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "delivered_pending_docs",
]);

const NEEDS_RETURN_STATUSES = new Set(["dispatched", "at_pickup", "in_transit", "at_delivery", "delivered", "delivered_pending_docs"]);

type UnitPair = {
  unitId: string;
  unitNumber: string;
  driverName: string | null;
  outbound: DispatchLoadRow | null;
  returnLoad: DispatchLoadRow | null;
  needsReturn: boolean;
};

type Props = {
  loads: DispatchLoadRow[];
  operatingCompanyId: string;
  loading: boolean;
  listError?: DataTableErrorState;
  onLoadClick: (loadId: string) => void;
  onBookReturn: () => void;
};

function TripCard({
  load,
  tag,
  onClick,
}: {
  load: DispatchLoadRow;
  tag?: string;
  onClick: (loadId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(load.id)}
      className="w-full rounded border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:border-blue-300 hover:shadow"
      data-testid={`round-trip-load-${load.load_number}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900">{load.load_number}</span>
        <div className="flex items-center gap-1">
          {tag ? (
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">{tag}</span>
          ) : null}
          <span className="text-sm">{FLAG_EMOJI_BY_CODE[load.flag_code] ?? "⚪"}</span>
        </div>
      </div>
      <div className="mt-1 text-xs text-gray-700">{load.customer_name ?? "—"}</div>
      <div className="mt-1 text-[11px] text-gray-500">{toRouteSummary(load.first_pickup_city, load.first_delivery_city)}</div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-600">
        <span>{load.assigned_primary_driver_name ?? "Unassigned"}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5">{STATUS_LABEL[load.status]}</span>
      </div>
      <div className="mt-1 text-[10px] font-semibold text-gray-800">
        {formatMoneyCents(load.rate_total_cents, load.currency_code)}
      </div>
    </button>
  );
}

function NeedsReturnCard({ onBookReturn }: { onBookReturn: () => void }) {
  return (
    <div
      className="flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-amber-400 bg-amber-50/40 p-3 text-center"
      data-testid="round-trip-needs-return"
    >
      <span className="text-xs font-semibold text-amber-900">Needs return</span>
      <Button type="button" size="sm" variant="secondary" onClick={onBookReturn}>
        + Book return
      </Button>
    </div>
  );
}

function buildUnitPairs(
  loads: DispatchLoadRow[],
  preSettlements: Array<{
    driver_id: string;
    first_load_id: string | null;
    last_load_id: string | null;
  }>,
  idleUnits: Array<{ id: string; unit_number: string; driver_name: string | null; last_drop_at: string | null }>
): UnitPair[] {
  const loadById = new Map(loads.map((load) => [load.id, load]));
  const loadsByUnit = new Map<string, DispatchLoadRow[]>();
  const preByDriver = new Map(preSettlements.map((row) => [row.driver_id, row]));

  for (const load of loads) {
    const unitId = load.assigned_unit_id;
    if (!unitId) continue;
    if (!ACTIVE_STATUSES.has(load.status)) continue;
    loadsByUnit.set(unitId, [...(loadsByUnit.get(unitId) ?? []), load]);
  }

  const pairByUnit = new Map<string, UnitPair>();

  for (const [unitId, unitLoads] of loadsByUnit) {
    const sorted = [...unitLoads].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const driverId = sorted[0]?.assigned_primary_driver_id ?? null;
    const pre = driverId ? preByDriver.get(driverId) : undefined;

    let outbound: DispatchLoadRow | null = null;
    let returnLoad: DispatchLoadRow | null = null;

    if (pre?.first_load_id) {
      outbound = loadById.get(pre.first_load_id) ?? sorted.find((load) => load.id === pre.first_load_id) ?? sorted[0] ?? null;
    } else {
      outbound = sorted[0] ?? null;
    }

    if (pre?.last_load_id && pre.last_load_id !== pre.first_load_id) {
      returnLoad = loadById.get(pre.last_load_id) ?? sorted.find((load) => load.id === pre.last_load_id) ?? null;
    } else if (sorted.length >= 2) {
      returnLoad = sorted.find((load) => load.id !== outbound?.id) ?? null;
    }

    const needsReturn = Boolean(outbound && !returnLoad && NEEDS_RETURN_STATUSES.has(outbound.status));

    pairByUnit.set(unitId, {
      unitId,
      unitNumber: outbound?.assigned_unit_number ?? sorted[0]?.assigned_unit_number ?? unitId,
      driverName: outbound?.assigned_primary_driver_name ?? sorted[0]?.assigned_primary_driver_name ?? null,
      outbound,
      returnLoad,
      needsReturn,
    });
  }

  for (const unit of idleUnits) {
    if (!unit.last_drop_at || pairByUnit.has(unit.id)) continue;
    pairByUnit.set(unit.id, {
      unitId: unit.id,
      unitNumber: unit.unit_number,
      driverName: unit.driver_name,
      outbound: null,
      returnLoad: null,
      needsReturn: true,
    });
  }

  for (const pre of preSettlements) {
    if (!pre.first_load_id || (pre.last_load_id && pre.last_load_id !== pre.first_load_id)) continue;
    const outbound = loadById.get(pre.first_load_id);
    const unitId = outbound?.assigned_unit_id;
    if (!unitId || pairByUnit.has(unitId)) continue;
    pairByUnit.set(unitId, {
      unitId,
      unitNumber: outbound.assigned_unit_number ?? unitId,
      driverName: outbound.assigned_primary_driver_name ?? null,
      outbound,
      returnLoad: null,
      needsReturn: true,
    });
  }

  return [...pairByUnit.values()].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
}

export function RoundTrips({ loads, operatingCompanyId, loading, listError, onLoadClick, onBookReturn }: Props) {
  const enabled = Boolean(operatingCompanyId);

  const preSettlementsQuery = useQuery({
    queryKey: ["dispatch", "round-trips", "pre-settlements", operatingCompanyId],
    queryFn: () => listOpenPreSettlements(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const idleUnitsQuery = useQuery({
    queryKey: ["dispatch", "round-trips", "units-without-load", operatingCompanyId],
    queryFn: () => listUnitsWithoutLoad(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const pairs = useMemo(
    () =>
      buildUnitPairs(
        loads,
        preSettlementsQuery.data?.pre_settlements ?? [],
        idleUnitsQuery.data?.units ?? []
      ),
    [idleUnitsQuery.data?.units, loads, preSettlementsQuery.data?.pre_settlements]
  );

  if (listError) {
    return (
      <ListErrorState
        title="Round trips unavailable"
        status={listError.status}
        message={listError.message}
        onRetry={listError.onRetry}
      />
    );
  }

  if (!enabled) {
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const isLoading = loading || preSettlementsQuery.isLoading || idleUnitsQuery.isLoading;

  return (
    <div className="space-y-2" data-testid="dispatch-round-trips-view">
      <div className="text-xs text-gray-600">
        Unit outbound + return pairing — bands implicit by row, not status columns.
      </div>

      {isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading round trips…</div>
      ) : pairs.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">
          No active unit round trips. Book loads to see outbound + return pairing.
        </div>
      ) : (
        <div className="space-y-2">
          {pairs.map((pair) => (
            <div
              key={pair.unitId}
              className="grid grid-cols-1 gap-2 rounded border border-gray-200 bg-gray-50/80 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              data-testid={`round-trip-row-${pair.unitNumber}`}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {pair.unitNumber}
                  {pair.driverName ? ` · ${pair.driverName}` : ""}
                </div>
                {pair.outbound ? (
                  <TripCard load={pair.outbound} onClick={onLoadClick} />
                ) : (
                  <div className="rounded border border-dashed border-gray-300 bg-white px-3 py-6 text-center text-xs text-gray-500">
                    No active outbound load
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Return leg</div>
                {pair.returnLoad ? (
                  <TripCard load={pair.returnLoad} tag="RETURN·SB" onClick={onLoadClick} />
                ) : pair.needsReturn ? (
                  <NeedsReturnCard onBookReturn={onBookReturn} />
                ) : (
                  <div className="rounded border border-dashed border-gray-300 bg-white px-3 py-6 text-center text-xs text-gray-500">
                    Return not required yet
                  </div>
                )}
              </div>

              <div className="hidden items-center justify-center md:flex">
                {pair.needsReturn && !pair.returnLoad ? (
                  <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">Needs return</span>
                ) : pair.returnLoad ? (
                  <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">Paired</span>
                ) : (
                  <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-700">Open</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
