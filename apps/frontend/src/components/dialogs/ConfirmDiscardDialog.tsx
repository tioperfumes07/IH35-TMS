import { createPortal } from "react-dom";
import { Button } from "../Button";

type Props = {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
};

/**
 * Blocking confirm over an open modal. Renders at z-index above `Modal` (z-[215]).
 *
 * Z-INDEX-DRIFT (2026-08-21, CC-3): CANCEL-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER's fix bumped the
 * shared Modal.tsx from z-[70] to z-[215], but this dialog — Modal's own unsaved-changes guard,
 * rendered BY Modal.tsx itself when `attemptClose` finds unsaved changes — stayed hardcoded at
 * z-[80]. Both createPortal independently to document.body as stacking-context siblings, so
 * Modal's own backdrop painted OVER its own discard-confirmation dialog: a user closing any Modal
 * with unsaved changes (e.g. BookLoadModalV4) got no visible "Discard unsaved changes?" prompt —
 * clicks landed on Modal's onMouseDown={attemptClose} instead of Cancel/Discard. Bumped to
 * z-[1004] — above Modal's 1001 and ParityDrawer's stackAboveModal 1003, below Combobox's
 * LISTBOX_Z_INDEX=220. Locked by verify-confirm-discard-dialog-z-index-above-modal.mjs.
 */
export function ConfirmDiscardDialog({ open, onCancel, onDiscard }: Props) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1004] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={onCancel}
      role="presentation"
      data-testid="confirm-discard-backdrop"
    >
      {/*
        SETL-F441 / owner: discard is a NORMAL dialog box (~320px), never a full-screen panel.
        Prior fluid max-width stretch on half drawers is gone; pin an explicit width.
        Radius 2px (rounded-sm) — GLOBAL-TYPE-SIZE-BASELINE / SQUARE-EDGES LAW.
      */}
      <div
        className="w-[320px] max-w-[calc(100vw-2rem)] rounded-sm border border-[#E5E7EB] bg-white p-3 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-discard-title"
        data-testid="confirm-discard-dialog"
      >
        <h3 id="confirm-discard-title" className="text-xs font-semibold text-[#0F1219]">
          Discard unsaved changes?
        </h3>
        <p className="mt-2 text-xs text-[#6B7280]">Your edits will be lost.</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
