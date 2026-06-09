/**
 * ParityDrawer — bounded right-drawer shell for create/edit (A3).
 *
 * Additive presentational shell (no financial wiring). ~576px on desktop,
 * full-width on mobile; header + scrollable body + sticky footer. Used by
 * B1–B3 for item/customer/vendor/account create-edit panels. Transaction
 * editors are full-page and do NOT use this drawer.
 */
import type { ReactNode } from "react";
import { PARITY_DRAWER_WIDTH, PARITY_DRAWER_WIDTH_WIDE } from "./sizing";

export type ParityDrawerProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Sticky footer slot (Cancel / Save / Make inactive). */
  footer?: ReactNode;
  children: ReactNode;
  /** "regular" ≈576px, "wide" ≈700px. */
  size?: "regular" | "wide";
};

export function ParityDrawer({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
  size = "regular",
}: ParityDrawerProps) {
  if (!open) return null;
  const widthClass = size === "wide" ? PARITY_DRAWER_WIDTH_WIDE : PARITY_DRAWER_WIDTH;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={title}
        className={`absolute right-0 top-0 flex h-full max-h-[100vh] flex-col border-l border-gray-200 bg-white shadow-xl ${widthClass}`}
      >
        <header className="flex items-start justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-gray-900">{title}</h2>
            {subtitle ? <p className="truncate text-[12px] text-gray-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="min-h-11 rounded px-2 text-gray-500 hover:bg-gray-100 sm:min-h-0"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? (
          <footer className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">{footer}</footer>
        ) : null}
      </aside>
    </div>
  );
}
