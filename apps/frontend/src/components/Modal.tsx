import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { colors, spacing, typography } from "../design/tokens";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function Modal({ open, onClose, title, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const firstInput = panel?.querySelector<HTMLElement>("input, select, textarea, button");
    firstInput?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div ref={panelRef} className="w-full max-w-lg bg-white shadow-xl" style={{ borderRadius: spacing.radiusCard }} onMouseDown={(event) => event.stopPropagation()}>
        <div
          className="flex items-center justify-between border-b border-gray-200 bg-gray-50"
          style={{ height: spacing.panelHeaderHeight, paddingLeft: spacing.panelPaddingX, paddingRight: spacing.panelPaddingX }}
        >
          <h2 className="uppercase" style={{ fontSize: typography.panelHeader, color: colors.bodyText, letterSpacing: typography.tightUpper }}>{title}</h2>
          <button className="text-[11px] text-gray-500 hover:text-gray-700" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div style={{ padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px` }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
