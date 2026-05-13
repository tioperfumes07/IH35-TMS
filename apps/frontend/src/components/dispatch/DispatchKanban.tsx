import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import type { DispatchLoadRow, LoadStatus } from "../../api/loads";
import { useToast } from "../Toast";
import { DISPATCH_STATUS_GROUPS, normalizeStatusToColumnKey } from "./constants";
import { KanbanColumn } from "./KanbanColumn";

type Props = {
  loads: DispatchLoadRow[];
  loading: boolean;
  onLoadClick: (loadId: string) => void;
  onStatusDrop: (loadId: string, nextStatus: LoadStatus) => Promise<void>;
};

function groupLoadsByColumn(loads: DispatchLoadRow[]) {
  const grouped = new Map<string, DispatchLoadRow[]>();
  for (const group of DISPATCH_STATUS_GROUPS) grouped.set(group.key, []);
  for (const load of loads) {
    const key = normalizeStatusToColumnKey(load.status);
    grouped.set(key, [...(grouped.get(key) ?? []), load]);
  }
  return grouped;
}

export function DispatchKanban({ loads, loading, onLoadClick, onStatusDrop }: Props) {
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
    const targetGroup = DISPATCH_STATUS_GROUPS.find((group) => group.key === targetColumnKey);
    const load = optimisticLoads.find((item) => item.id === loadId);
    if (!targetGroup || !load) return;
    if (targetGroup.statuses.includes(load.status)) return;

    const nextStatus = targetGroup.statuses[0];
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

  if (loading) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading dispatch board...</div>;
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex w-full min-w-0 gap-3 overflow-x-auto pb-2">
        {DISPATCH_STATUS_GROUPS.map((group) => (
          <KanbanColumn
            key={group.key}
            columnKey={group.key}
            title={group.title}
            loads={grouped.get(group.key) ?? []}
            collapsed={Boolean(group.collapsedByDefault)}
            onLoadClick={onLoadClick}
          />
        ))}
      </div>
    </DndContext>
  );
}
