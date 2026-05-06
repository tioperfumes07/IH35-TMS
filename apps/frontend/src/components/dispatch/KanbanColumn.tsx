import { useDroppable } from "@dnd-kit/core";
import type { DispatchLoadRow } from "../../api/loads";
import { LoadCard } from "./LoadCard";

type Props = {
  columnKey: string;
  title: string;
  loads: DispatchLoadRow[];
  collapsed?: boolean;
  onLoadClick: (loadId: string) => void;
};

export function KanbanColumn({ columnKey, title, loads, collapsed = false, onLoadClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${columnKey}` });

  if (collapsed) {
    return (
      <section className="min-w-[270px] rounded border border-gray-200 bg-white p-2">
        <header className="flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
        </header>
      </section>
    );
  }

  return (
    <section className="min-w-[290px] flex-1 rounded border border-gray-200 bg-white p-2">
      <header className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
      </header>
      <div
        ref={setNodeRef}
        className={`max-h-[68vh] space-y-2 overflow-y-auto rounded p-1 ${isOver ? "bg-blue-50" : "bg-transparent"}`}
      >
        {loads.length === 0 ? <div className="rounded border border-dashed border-gray-300 p-3 text-xs text-gray-500">(empty)</div> : null}
        {loads.map((load) => (
          <LoadCard key={load.id} load={load} onClick={onLoadClick} />
        ))}
      </div>
    </section>
  );
}
