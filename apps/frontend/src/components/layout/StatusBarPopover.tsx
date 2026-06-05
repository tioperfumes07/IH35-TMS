import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function StatusBarPopover({ open, anchorRef, onClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute left-1/2 top-full z-40 mt-1 w-[min(280px,92vw)] -translate-x-1/2 rounded-lg border border-slate-600 bg-[#151A24] p-3 text-xs text-slate-100 shadow-lg"
      role="dialog"
      aria-label={title}
    >
      <div className="mb-1 font-semibold text-white">{title}</div>
      {children}
    </div>
  );
}
