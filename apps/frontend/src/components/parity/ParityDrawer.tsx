/**
 * ParityDrawer — bounded right-drawer shell for create/edit (A3).
 *
 * Additive presentational shell (no financial wiring). ~576px on desktop,
 * full-width on mobile; header + scrollable body + sticky footer. Used by
 * B1–B3 for item/customer/vendor/account create-edit panels, and by owner
 * creator-chrome lock for Expense / Bill / Bill-payment create (QBO-like
 * side panels). Create Vendor / Create Customer stay centered rich modals.
 */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widthClass = size === "wide" ? PARITY_DRAWER_WIDTH_WIDE : PARITY_DRAWER_WIDTH;

  // INLINE-CREATE-NESTED-FORM (2026-08-02): rendered through a PORTAL to document.body, not inline.
  //
  // WHY THIS IS CORRECTNESS, NOT COSMETICS. Drawers host create FORMS, and drawers open from inside
  // other forms — the Book Load wizard (BookLoadModalV4.tsx) wraps its whole body in <form>. Rendered
  // inline, NewCustomerDrawerForm's <form> became a form nested inside a form, and the HTML5 parser
  // DELETES a nested <form> start tag. The consequences, all observed live:
  //   • the inner form element never exists, so its onSubmit (preventDefault + POST createCustomer)
  //     NEVER RUNS — the record is never created;
  //   • its <button type="submit"> re-associates with the OUTER wizard form and submits THAT, which
  //     reads as a native GET (?customer_type=…) and closes the wizard as if it had succeeded.
  // Standalone /customers create worked precisely because there is no outer form there.
  //
  // The portal moves the drawer out of the wizard's DOM subtree, so the inner <form> is a real
  // element again. Positioning is unaffected: this root is `fixed inset-0`, which resolves against
  // the viewport, not the parent. React events still bubble through the REACT tree even across a
  // portal, so the drawer forms ALSO stopPropagation() on submit — the portal alone is not enough.
  //
  // STACKING (live 2026-08-04): BookLoadModalV4 / shared Modal shells sit at z-50. This drawer must
  // stack ABOVE them (z-[60]) or Save clicks hit the wizard backdrop (onMouseDown → close) and the
  // create never POSTs — same symptom as the nested-form GET (wizard closes, nothing persisted).
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={title}
        className={`absolute right-0 top-0 flex h-full max-h-screen flex-col border-l border-gray-200 bg-white shadow-xl ${widthClass}`}
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
            className="min-h-11 rounded-sm px-2 text-gray-500 hover:bg-gray-100 sm:min-h-0"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? (
          <footer className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">{footer}</footer>
        ) : null}
      </aside>
    </div>,
    document.body
  );
}
