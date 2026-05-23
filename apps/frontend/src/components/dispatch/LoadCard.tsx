import { useDraggable } from "@dnd-kit/core";
import type { DispatchLoadRow } from "../../api/loads";
import { FLAG_EMOJI_BY_CODE, STATUS_LABEL, canDragLoad, formatMoneyCents, toRouteSummary } from "./constants";

type Props = {
  load: DispatchLoadRow;
  onClick: (id: string) => void;
};

function progressPill(progress: DispatchLoadRow["progress_status"]) {
  if (progress === "early" || progress === "on_track") return "bg-emerald-100 text-emerald-800";
  if (progress === "behind") return "bg-amber-100 text-amber-800";
  if (progress === "delayed") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

function progressLabel(progress: DispatchLoadRow["progress_status"]) {
  if (!progress) return "unknown";
  return progress.replace("_", " ");
}

export function LoadCard({ load, onClick }: Props) {
  const draggableEnabled = canDragLoad(load.status);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: { loadId: load.id, status: load.status },
    disabled: !draggableEnabled,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

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
    >
      <div className="absolute inset-y-0 right-0 w-1 rounded-r bg-gray-400" />
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-gray-900">{load.load_number}</div>
        <div className="text-sm">{FLAG_EMOJI_BY_CODE[load.flag_code] ?? "⚪"}</div>
      </div>
      <div className="mt-1 text-sm text-gray-700">{load.customer_name ?? "-"}</div>
      <div className="mt-1 text-xs text-gray-500">{toRouteSummary(load.first_pickup_city, load.first_delivery_city)}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
        <span>{load.assigned_primary_driver_name ?? "Unassigned"}</span>
        <span>{new Date(load.created_at).toLocaleDateString()}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{STATUS_LABEL[load.status]}</span>
        <span className="font-semibold text-gray-800">{formatMoneyCents(load.rate_total_cents, load.currency_code)}</span>
      </div>
      <div className="mt-1">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${progressPill(load.progress_status)}`}
          title={
            load.progress_eta_delta_minutes == null
              ? "No live GPS/appointment delta available."
              : `ETA delta vs scheduled: ${load.progress_eta_delta_minutes} min`
          }
        >
          {progressLabel(load.progress_status)}
        </span>
      </div>
    </div>
  );
}
