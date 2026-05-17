import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getLoadStopsForDispatch, replaceLoadStopsDispatch, type RefinedLoadStop } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

export type UiStopType = "pickup" | "dropoff" | "fuel" | "rest" | "customs";

export type MultiStopRow = {
  key: string;
  stop_type: UiStopType;
  location_address: string;
  city: string;
  state: string;
  country: string;
  window_start: string;
  window_end: string;
  notes: string;
  signature_required: boolean;
  photo_required: boolean;
  latitude: string;
  longitude: string;
};

function apiStopToRow(s: RefinedLoadStop): MultiStopRow {
  const st = s.stop_type === "delivery" ? "dropoff" : s.stop_type === "border" ? "customs" : (s.stop_type as UiStopType);
  const wStart = s.appointment_start_at ?? s.scheduled_arrival_at ?? "";
  const wEnd = s.appointment_end_at ?? "";
  return {
    key: s.id,
    stop_type: st,
    location_address: s.address_line1 ?? "",
    city: s.city ?? "",
    state: s.state ?? "",
    country: s.country ?? "US",
    window_start: wStart ? wStart.slice(0, 16) : "",
    window_end: wEnd ? wEnd.slice(0, 16) : "",
    notes: s.notes ?? "",
    signature_required: Boolean(s.signature_required),
    photo_required: Boolean(s.photo_required),
    latitude: s.latitude != null ? String(s.latitude) : "",
    longitude: s.longitude != null ? String(s.longitude) : "",
  };
}

function padIsoLocal(draft: string): string | null {
  if (!draft || draft.length < 10) return null;
  const normalized = draft.includes("T") ? draft : `${draft}:00`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function SortableRow({
  row,
  index,
  onChange,
  onRemove,
}: {
  row: MultiStopRow;
  index: number;
  onChange: (key: string, patch: Partial<MultiStopRow>) => void;
  onRemove: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded border border-gray-200 bg-white p-2 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-1 cursor-grab rounded border border-gray-200 px-1 text-xs text-gray-500"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          ::
        </button>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] font-semibold text-gray-500">#{index + 1} Type</div>
            <SelectCombobox
              className="mt-0.5 h-8 w-full rounded border border-gray-300 px-1 text-xs"
              value={row.stop_type}
              onChange={(e) => onChange(row.key, { stop_type: e.target.value as UiStopType })}
            >
              {(["pickup", "dropoff", "fuel", "rest", "customs"] as const).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectCombobox>
          </div>
          <div className="flex items-end justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => onRemove(row.key)}>
              Remove
            </Button>
          </div>
          <div className="col-span-2">
            <div className="text-[10px] font-semibold text-gray-500">Address</div>
            <input
              className="mt-0.5 h-8 w-full rounded border border-gray-300 px-2 text-xs"
              value={row.location_address}
              onChange={(e) => onChange(row.key, { location_address: e.target.value })}
            />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-500">City</div>
            <input className="mt-0.5 h-8 w-full rounded border border-gray-300 px-2 text-xs" value={row.city} onChange={(e) => onChange(row.key, { city: e.target.value })} />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-500">ST</div>
            <input className="mt-0.5 h-8 w-full rounded border border-gray-300 px-2 text-xs" value={row.state} onChange={(e) => onChange(row.key, { state: e.target.value })} />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-500">Window start</div>
            <input
              type="datetime-local"
              className="mt-0.5 h-8 w-full rounded border border-gray-300 px-1 text-xs"
              value={row.window_start}
              onChange={(e) => onChange(row.key, { window_start: e.target.value })}
            />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-500">Window end</div>
            <input
              type="datetime-local"
              className="mt-0.5 h-8 w-full rounded border border-gray-300 px-1 text-xs"
              value={row.window_end}
              onChange={(e) => onChange(row.key, { window_end: e.target.value })}
            />
          </div>
          <label className="col-span-1 flex items-center gap-1 text-xs">
            <input type="checkbox" checked={row.signature_required} onChange={(e) => onChange(row.key, { signature_required: e.target.checked })} />
            Sig
          </label>
          <label className="col-span-1 flex items-center gap-1 text-xs">
            <input type="checkbox" checked={row.photo_required} onChange={(e) => onChange(row.key, { photo_required: e.target.checked })} />
            Photo
          </label>
          <div className="col-span-2">
            <div className="text-[10px] font-semibold text-gray-500">Notes</div>
            <textarea className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs" rows={2} value={row.notes} onChange={(e) => onChange(row.key, { notes: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  );
}

type Props = {
  loadId: string;
  operatingCompanyId: string;
};

export function MultiStopEditor({ loadId, operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<MultiStopRow[]>([]);

  const q = useQuery({
    queryKey: ["dispatch", "load-stops-refined", loadId, operatingCompanyId],
    queryFn: () => getLoadStopsForDispatch(loadId, operatingCompanyId),
    enabled: Boolean(loadId && operatingCompanyId),
  });

  useEffect(() => {
    if (q.data?.stops) setRows(q.data.stops.map(apiStopToRow));
  }, [q.data]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((items) => {
      const oldIndex = items.findIndex((i) => i.key === String(active.id));
      const newIndex = items.findIndex((i) => i.key === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const totals = useMemo(() => {
    const n = Math.max(0, rows.length - 1);
    const dist = n * 145;
    const hrs = n * 2 + dist / 55;
    return { dist, hrs };
  }, [rows.length]);

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        operating_company_id: operatingCompanyId,
        stops: rows.map((r, idx) => {
          const lat = r.latitude.trim() === "" ? null : Number(r.latitude);
          const lng = r.longitude.trim() === "" ? null : Number(r.longitude);
          return {
            sequence_number: idx + 1,
            stop_type: r.stop_type,
            location_address: r.location_address || null,
            city: r.city || null,
            state: r.state || null,
            country: r.country || "US",
            address_line1: r.location_address || null,
            latitude: lat != null && Number.isFinite(lat) ? lat : null,
            longitude: lng != null && Number.isFinite(lng) ? lng : null,
            window_start: padIsoLocal(r.window_start),
            window_end: padIsoLocal(r.window_end),
            notes: r.notes || null,
            signature_required: r.signature_required,
            photo_required: r.photo_required,
          };
        }),
      };
      if (body.stops.length < 2) throw new Error("need_two_stops");
      return replaceLoadStopsDispatch(loadId, body);
    },
    onSuccess: async () => {
      pushToast("Stops saved", "success");
      await qc.invalidateQueries({ queryKey: ["dispatch", "load-stops-refined", loadId, operatingCompanyId] });
      await qc.invalidateQueries({ queryKey: ["loads", "detail", loadId] });
    },
  });

  const patchRow = (key: string, patch: Partial<MultiStopRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const addStop = () => {
    setRows((prev) => [
      ...prev,
      {
        key: `new-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())}`,
        stop_type: "rest",
        location_address: "",
        city: "",
        state: "",
        country: "US",
        window_start: "",
        window_end: "",
        notes: "",
        signature_required: false,
        photo_required: false,
        latitude: "",
        longitude: "",
      },
    ]);
  };

  if (q.isLoading) return <div className="text-sm text-gray-500">Loading stops…</div>;
  if (q.isError) return <div className="text-sm text-red-600">Could not load stops.</div>;

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <SortableRow key={row.key} row={row} index={index} onChange={patchRow} onRemove={removeRow} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button type="button" size="sm" variant="secondary" onClick={addStop}>
        + Add stop
      </Button>
      <div className="rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-700">
        Est. leg miles: ~{totals.dist} · Est. hours: ~{totals.hrs.toFixed(1)}
      </div>
      {mut.isError ? <div className="text-xs text-red-600">Save failed (need at least 2 stops).</div> : null}
      <Button type="button" size="sm" loading={mut.isPending} onClick={() => void mut.mutateAsync()}>
        Save stops
      </Button>
    </div>
  );
}
