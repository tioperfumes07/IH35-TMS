import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { DispatchLoadRow, LoadStatus } from "../../api/loads";
import type { DataTableErrorState } from "../../lib/tableError";
import { classifyProfit, formatProfitCents, getLoadProfitability, profitBadgeClassName } from "../../lib/loadProfit";
import { ListErrorState } from "../ListErrorState";
import { useToast } from "../Toast";
import { canDragLoad, FLAG_EMOJI_BY_CODE, toRouteSummary } from "./constants";

type Props = {
  loads: DispatchLoadRow[];
  activeGeofenceBreachVehicleIds?: Set<string>;
  loading: boolean;
  onLoadClick: (loadId: string) => void;
  onStatusDrop: (loadId: string, nextStatus: LoadStatus) => Promise<void>;
  listError?: DataTableErrorState;
};

type KanbanLoadExtras = {
  commodity?: string | null;
  weight_lbs?: number | null;
  trailer_type?: string | null;
  load_type?: string | null;
  geofence_state?: string | null;
  pickup_geofence_state?: string | null;
  delivery_geofence_state?: string | null;
  pickup_dwell_minutes?: number | null;
  delivery_dwell_minutes?: number | null;
  pickup_free_time_minutes?: number | null;
  delivery_free_time_minutes?: number | null;
  pickup_detention_minutes?: number | null;
  delivery_detention_minutes?: number | null;
  factoring_status?: string | null;
  net_profit_cents?: number | null;
  margin_pct?: number | null;
};

type KanbanLoad = DispatchLoadRow & KanbanLoadExtras;

type KanbanColumnDef = {
  key: string;
  title: string;
  collapsedByDefault?: boolean;
  statuses: string[];
  dropStatus: LoadStatus;
  showDwell?: boolean;
};

const KANBAN_STATUS_GROUPS: KanbanColumnDef[] = [
  { key: "pending", title: "Pending", statuses: ["draft", "booked", "planned", "unassigned"], dropStatus: "planned" },
  { key: "assigned", title: "Assigned", statuses: ["assigned", "assigned_not_dispatched"], dropStatus: "assigned" },
  { key: "en_route", title: "En Route", statuses: ["dispatched"], dropStatus: "dispatched" },
  { key: "at_pickup", title: "At Pickup", statuses: ["at_pickup"], dropStatus: "at_pickup", showDwell: true },
  { key: "loaded", title: "Loaded", statuses: ["in_transit"], dropStatus: "in_transit" },
  { key: "at_delivery", title: "At Delivery", statuses: ["at_delivery"], dropStatus: "at_delivery", showDwell: true },
  { key: "delivered", title: "Delivered", statuses: ["delivered", "delivered_pending_docs"], dropStatus: "delivered" },
  { key: "completed", title: "Completed", statuses: ["invoiced", "paid", "closed", "completed_docs_received"], dropStatus: "closed" },
  {
    key: "cancelled",
    title: "Cancelled",
    statuses: ["cancelled", "abandoned", "driver_walkoff", "driver_no_show"],
    dropStatus: "cancelled",
    collapsedByDefault: true,
  },
];

function readExtras(load: DispatchLoadRow): KanbanLoadExtras {
  return load as KanbanLoad;
}

function resolveKanbanColumnKey(load: DispatchLoadRow): string {
  const extras = readExtras(load);
  const status = String(load.status);
  const pickupGeo = extras.pickup_geofence_state ?? null;
  const deliveryGeo = extras.delivery_geofence_state ?? null;
  const geofence = extras.geofence_state ?? null;

  if (status === "dispatched" && (pickupGeo === "at" || pickupGeo === "dwelling" || geofence === "at" || geofence === "dwelling")) {
    return "at_pickup";
  }
  if (status === "in_transit" && (deliveryGeo === "at" || deliveryGeo === "dwelling")) {
    return "at_delivery";
  }
  if (status === "dispatched" && (pickupGeo === "approaching" || geofence === "approaching")) {
    return "en_route";
  }

  const group = KANBAN_STATUS_GROUPS.find((entry) => entry.statuses.includes(status));
  return group?.key ?? "pending";
}

function groupLoadsByColumn(loads: DispatchLoadRow[]) {
  const grouped = new Map<string, DispatchLoadRow[]>();
  for (const group of KANBAN_STATUS_GROUPS) grouped.set(group.key, []);
  for (const load of loads) {
    const key = resolveKanbanColumnKey(load);
    grouped.set(key, [...(grouped.get(key) ?? []), load]);
  }
  return grouped;
}

function loadModeLabel(load: KanbanLoad): string {
  const trailer = String(load.trailer_type ?? "").toLowerCase();
  if (trailer.includes("reefer")) return "Reefer";
  const loadType = String(load.load_type ?? "").toLowerCase();
  if (loadType.includes("ltl")) return "LTL";
  return "FTL";
}

function formatWeight(weightLbs?: number | null): string {
  if (weightLbs == null || weightLbs <= 0) return "—";
  return `${weightLbs.toLocaleString("en-US")} lbs`;
}

function driverUnitLabel(load: DispatchLoadRow): string {
  const driver = load.assigned_primary_driver_name;
  const unit = load.assigned_unit_number;
  if (!driver && !unit) return "Unassigned";
  if (driver && unit) return `${driver} · ${unit}`;
  return driver ?? unit ?? "Unassigned";
}

function onTimeChipClass(load: DispatchLoadRow): string {
  if (load.on_time_prediction === "green") return "bg-emerald-100 text-emerald-800";
  if (load.on_time_prediction === "amber") return "bg-amber-100 text-amber-800";
  if (load.on_time_prediction === "red") return "bg-red-100 text-red-800";
  if (load.progress_status === "early" || load.progress_status === "on_track") return "bg-emerald-100 text-emerald-800";
  if (load.progress_status === "behind") return "bg-amber-100 text-amber-800";
  if (load.progress_status === "delayed") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

function onTimeChipLabel(load: DispatchLoadRow): string {
  if (load.on_time_prediction === "green") return "On time";
  if (load.on_time_prediction === "amber") return "At risk";
  if (load.on_time_prediction === "red") return "Late";
  if (load.progress_status === "early") return "Early";
  if (load.progress_status === "on_track") return "On time";
  if (load.progress_status === "behind") return "Behind";
  if (load.progress_status === "delayed") return "Delayed";
  return "Unknown";
}

function isBreakdown(load: DispatchLoadRow): boolean {
  return load.driver_lifecycle_stage === "breakdown";
}

function isEtaHeld(load: DispatchLoadRow): boolean {
  return isBreakdown(load) && !load.samsara_eta_at;
}

function dwellMetrics(load: KanbanLoad, columnKey: string) {
  if (columnKey === "at_pickup") {
    return {
      dwell: load.pickup_dwell_minutes ?? null,
      free: load.pickup_free_time_minutes ?? null,
      det: load.pickup_detention_minutes ?? null,
    };
  }
  if (columnKey === "at_delivery") {
    return {
      dwell: load.delivery_dwell_minutes ?? null,
      free: load.delivery_free_time_minutes ?? null,
      det: load.delivery_detention_minutes ?? null,
    };
  }
  return null;
}

function formatMinutes(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function factoringStatusLabel(status: string | null | undefined): string | null {
  if (!status || status === "not_factored") return null;
  return status.replaceAll("_", " ");
}

function DeliveredProfitBadge({ load }: { load: KanbanLoad }) {
  const inlineCents = load.net_profit_cents;
  const inlineMargin = load.margin_pct;

  const profitabilityQuery = useQuery({
    queryKey: ["kanban", "load-profit", load.id, load.operating_company_id],
    queryFn: () => getLoadProfitability(load.id, load.operating_company_id),
    enabled: inlineCents == null && ["delivered", "delivered_pending_docs"].includes(String(load.status)),
    staleTime: 60_000,
  });

  const netCents = inlineCents ?? profitabilityQuery.data?.net_profit_cents;
  const marginPct = inlineMargin ?? profitabilityQuery.data?.margin_pct;

  if (netCents == null) {
    if (profitabilityQuery.isLoading) {
      return (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${profitBadgeClassName("loading")}`}>Profit…</span>
      );
    }
    return null;
  }

  const variant = classifyProfit(netCents, marginPct ?? 0);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${profitBadgeClassName(variant)}`} title={`Net profit (${marginPct ?? 0}% margin)`}>
      {formatProfitCents(netCents)}
    </span>
  );
}

function KanbanDispatchCard({
  load,
  columnKey,
  hasActiveGeofenceBreach,
  onClick,
}: {
  load: KanbanLoad;
  columnKey: string;
  hasActiveGeofenceBreach?: boolean;
  onClick: (id: string) => void;
}) {
  const draggableEnabled = canDragLoad(load.status);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: { loadId: load.id, status: load.status },
    disabled: !draggableEnabled,
  });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);
  const commodity = load.commodity?.trim() || "—";
  const weight = formatWeight(load.weight_lbs);
  const mode = loadModeLabel(load);
  const dwell = dwellMetrics(load, columnKey);
  const factoring = factoringStatusLabel(load.factoring_status);
  const isDeliveredColumn = columnKey === "delivered";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(load.id)}
      className={`relative cursor-pointer rounded border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
        isDragging ? "opacity-60" : ""
      } ${draggableEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
      data-testid={`kanban-card-${load.load_number}`}
    >
      <div className="absolute inset-y-0 right-0 w-1 rounded-r bg-gray-400" />
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-gray-900">{load.load_number}</div>
        <div className="text-sm">{FLAG_EMOJI_BY_CODE[load.flag_code] ?? "⚪"}</div>
      </div>

      <div className="mt-1 text-xs text-gray-600">{lane}</div>
      <div className="mt-1 text-xs font-medium text-gray-800">{driverUnitLabel(load)}</div>

      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-600">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{mode}</span>
        <span>{weight}</span>
        <span className="truncate" title={commodity}>
          {commodity}
        </span>
      </div>

      {dwell ? (
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">Dwell {formatMinutes(dwell.dwell)}</span>
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">Free {formatMinutes(dwell.free)}</span>
          <span className={`rounded px-1.5 py-0.5 ${dwell.det != null && dwell.det > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}`}>
            Det {formatMinutes(dwell.det)}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${onTimeChipClass(load)}`}>{onTimeChipLabel(load)}</span>
        {isBreakdown(load) ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">Breakdown</span>
        ) : null}
        {isEtaHeld(load) ? (
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">ETA held</span>
        ) : null}
        {hasActiveGeofenceBreach ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Geofence</span>
        ) : null}
      </div>

      {isDeliveredColumn ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {factoring ? (
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-indigo-800">{factoring}</span>
          ) : null}
          <DeliveredProfitBadge load={load} />
        </div>
      ) : null}
    </div>
  );
}

function KanbanDispatchColumn({
  column,
  loads,
  activeGeofenceBreachVehicleIds,
  onLoadClick,
}: {
  column: KanbanColumnDef;
  loads: DispatchLoadRow[];
  activeGeofenceBreachVehicleIds?: Set<string>;
  onLoadClick: (loadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.key}` });

  if (column.collapsedByDefault) {
    return (
      <section className="min-w-[270px] rounded border border-gray-200 bg-white p-2" data-testid={`kanban-column-${column.key}`}>
        <header className="flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 className="text-sm font-semibold text-gray-700">{column.title}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
        </header>
      </section>
    );
  }

  return (
    <section className="min-w-[290px] flex-1 rounded border border-gray-200 bg-white p-2" data-testid={`kanban-column-${column.key}`}>
      <header className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">{column.title}</h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
      </header>
      <div ref={setNodeRef} className={`max-h-[68vh] space-y-2 overflow-y-auto rounded p-1 ${isOver ? "bg-blue-50" : "bg-transparent"}`}>
        {loads.length === 0 ? <div className="rounded border border-dashed border-gray-300 p-3 text-xs text-gray-500">(empty)</div> : null}
        {loads.map((load) => (
          <KanbanDispatchCard
            key={load.id}
            load={readExtras(load)}
            columnKey={column.key}
            hasActiveGeofenceBreach={Boolean(load.assigned_unit_id && activeGeofenceBreachVehicleIds?.has(load.assigned_unit_id))}
            onClick={onLoadClick}
          />
        ))}
      </div>
    </section>
  );
}

export function DispatchKanban({ loads, activeGeofenceBreachVehicleIds, loading, onLoadClick, onStatusDrop, listError }: Props) {
  const [optimisticLoads, setOptimisticLoads] = useState<DispatchLoadRow[]>(loads);
  const { pushToast } = useToast();

  useEffect(() => {
    setOptimisticLoads(loads);
  }, [loads]);

  const grouped = useMemo(() => groupLoadsByColumn(optimisticLoads), [optimisticLoads]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const activeId = event.active.id;
    const overId = event.over?.id;
    if (!activeId || !overId) return;
    const loadId = String(activeId);
    const targetColumnKey = String(overId).replace("column:", "");
    const targetGroup = KANBAN_STATUS_GROUPS.find((group) => group.key === targetColumnKey);
    const load = optimisticLoads.find((item) => item.id === loadId);
    if (!targetGroup || !load) return;
    if (resolveKanbanColumnKey(load) === targetColumnKey) return;

    const nextStatus = targetGroup.dropStatus;
    const previousLoads = optimisticLoads;
    setOptimisticLoads((current) =>
      current.map((item) => (item.id === loadId ? { ...item, status: nextStatus, flag_code: nextStatus === "cancelled" ? "RED" : item.flag_code } : item))
    );
    try {
      await onStatusDrop(loadId, nextStatus);
      pushToast(`Load ${load.load_number} moved to ${targetGroup.title}`, "success");
    } catch {
      setOptimisticLoads(previousLoads);
      pushToast("Status change rejected by server. Reverted.", "error");
    }
  };

  if (listError) {
    return (
      <ListErrorState
        title="Couldn't load dispatch board"
        status={listError.status}
        message={listError.message}
        onRetry={listError.onRetry}
      />
    );
  }

  if (loading) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading dispatch board...</div>;
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2" data-testid="dispatch-kanban-board">
        {KANBAN_STATUS_GROUPS.map((group) => (
          <KanbanDispatchColumn
            key={group.key}
            column={group}
            loads={grouped.get(group.key) ?? []}
            activeGeofenceBreachVehicleIds={activeGeofenceBreachVehicleIds}
            onLoadClick={onLoadClick}
          />
        ))}
      </div>
    </DndContext>
  );
}
