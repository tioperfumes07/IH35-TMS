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
import "../../styles/proportion-chrome.css";

export type ParityDrawerProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Nested create return affordance. When present, renders a visible back arrow in the header. */
  onBack?: () => void;
  /** Sticky footer slot (Cancel / Save / Make inactive). */
  footer?: ReactNode;
  children: ReactNode;
  /** "regular" ≈576px, "wide" ≈700px. */
  size?: "regular" | "wide";
  /**
   * Nested inline "+ Create" opened from a wide wizard / shared Modal (z-[215]). Stacks at
   * z-[218] so Save clicks are not intercepted by the parent overlay; Escape is scoped to this
   * drawer. Stays below Combobox.tsx's LISTBOX_Z_INDEX=220 so a picker opened inside this drawer
   * still paints on top of it.
   */
  stackAboveModal?: boolean;
};

export function ParityDrawer({
  open,
  title,
  subtitle,
  onClose,
  onBack,
  footer,
  children,
  size = "regular",
  stackAboveModal = false,
}: ParityDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // FLEET-F-ESCAPE-EATS-DRAWER (2026-08-21): the capture-phase listener below ran BEFORE a
      // nested Combobox's own bubble-phase Escape handler ever got a chance to fire, so pressing
      // Escape to dismiss an open picker dropdown inside this drawer instead discarded the whole
      // form (live-reproduced on Fleet's Create Unit: typed Unit Number, opened the Owner Company
      // picker, pressed Escape — the entire drawer closed and the typed value was gone). Combobox
      // already handles its own Escape correctly (closes just the dropdown, stopPropagation) — this
      // capture-phase listener just has to step aside while a Combobox listbox is open and let that
      // bubble-phase handler run instead of pre-empting it.
      if (document.querySelector('[data-combobox-listbox="portal"]')) return;
      e.preventDefault();
      // Capture + stop so parent Modal (Create WO) does not treat Escape as discard.
      if (stackAboveModal) {
        e.stopImmediatePropagation();
      }
      onClose();
    };
    document.addEventListener("keydown", onKey, stackAboveModal ? { capture: true } : false);
    return () => document.removeEventListener("keydown", onKey, stackAboveModal ? { capture: true } : false);
  }, [open, onClose, stackAboveModal]);

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
  // WO-CREATE-UX: shared Modal upgraded to z-[70]; nested QuickCreate uses stackAboveModal → z-[80].
  // Z-INDEX-DRIFT (2026-08-21, CC-3): CANCEL-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER's fix bumped the
  // shared Modal.tsx from z-[70] to z-[215] (to clear LoadDetailDrawer's z-[210]) but never touched
  // this drawer's stackAboveModal tier, which stayed at z-[80] — silently reopening
  // LV-WO-PARTPANEL-BEHIND-MODAL-DESTROYS-FORM: any nested "+ Create" (QuickCreateEntityModal,
  // CatalogQuickCreateDrawer, InlineCreateDrawer, CreateTrailerModal, CreateUnitModal) opened from
  // inside a Modal (Create Work Order, Book Load, etc.) painted BEHIND that Modal's backdrop again.
  // Bumped to z-[218] — above Modal's 215, below Combobox's LISTBOX_Z_INDEX=220 so a picker opened
  // inside this drawer still paints on top of it. Locked by verify-parity-drawer-z-index-above-modal.mjs.
  const stackClass = stackAboveModal ? "z-[218]" : "z-[60]";
  return createPortal(
    <div
      className={`fixed inset-0 ${stackClass}`}
      {...(stackAboveModal ? { "data-parity-drawer-stack-above-modal": "true" } : {})}
    >
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={title}
        data-parity-drawer=""
        data-proportion-chrome="qbo-compact"
        className={`absolute right-0 top-0 flex h-full max-h-screen flex-col border-l border-gray-200 bg-white shadow-xl ${widthClass}`}
      >
        <header
          className="flex items-start justify-between gap-2 border-b border-gray-200 px-4 py-3"
          data-proportion-chrome-header=""
        >
          <div className="flex min-w-0 items-start gap-2">
            {onBack ? (
              <button
                type="button"
                aria-label="Back to previous surface"
                onClick={onBack}
                className="min-h-11 rounded-sm px-2 text-lg text-gray-600 hover:bg-gray-100 sm:min-h-0"
              >
                ←
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-gray-900">{title}</h2>
              {subtitle ? <p className="truncate text-[12px] text-gray-500">{subtitle}</p> : null}
            </div>
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
