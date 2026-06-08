import { useCallback, useRef, useState } from "react";

export interface ColumnReorderResult {
  order: string[];
  setOrder: (order: string[]) => void;
  dragHandleProps: (columnId: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  dragOverId: string | null;
}

export function useColumnReorder(initialOrder: string[]): ColumnReorderResult {
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);

  const dragHandleProps = useCallback(
    (columnId: string) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        draggingIdRef.current = columnId;
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverId(columnId);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const from = draggingIdRef.current;
        if (!from || from === columnId) {
          setDragOverId(null);
          return;
        }
        setOrder((prev) => {
          const next = [...prev];
          const fromIdx = next.indexOf(from);
          const toIdx = next.indexOf(columnId);
          if (fromIdx === -1 || toIdx === -1) return prev;
          next.splice(fromIdx, 1);
          next.splice(toIdx, 0, from);
          return next;
        });
        setDragOverId(null);
        draggingIdRef.current = null;
      },
      onDragEnd: () => {
        setDragOverId(null);
        draggingIdRef.current = null;
      },
    }),
    []
  );

  return { order, setOrder, dragHandleProps, dragOverId };
}
