import type { CSSProperties, ReactNode } from "react";
import { useCallback, useRef } from "react";

type Props = {
  columnId: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange: (columnId: string, width: number) => void;
  children: ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
};

export function ResizableTh({
  columnId,
  width,
  minWidth = 60,
  maxWidth = 800,
  onWidthChange,
  children,
  className = "",
  align = "left",
}: Props) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      startXRef.current = event.clientX;
      startWidthRef.current = width;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current;
        const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
        onWidthChange(columnId, next);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [columnId, maxWidth, minWidth, onWidthChange, width]
  );

  const style: CSSProperties = {
    width,
    minWidth: width,
    maxWidth: width,
    position: "relative",
    textAlign: align,
  };

  return (
    <th className={`relative select-none ${className}`} style={style} data-resizable="true" data-column-id={columnId}>
      <div className="flex items-center justify-between gap-1 pr-2">
        <span className="truncate">{children}</span>
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${columnId} column`}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-[#1F2A44]"
          onMouseDown={onMouseDown}
        />
      </div>
    </th>
  );
}
