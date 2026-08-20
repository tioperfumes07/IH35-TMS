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
 * z-[219] — above Modal's 215 and ParityDrawer's stackAboveModal 218, below Combobox's
 * LISTBOX_Z_INDEX=220. Locked by verify-confirm-discard-dialog-z-index-above-modal.mjs.
 */
export function ConfirmDiscardDialog({ open, onCancel, onDiscard }: Props) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[219] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-discard-title"
      >
        <h3 id="confirm-discard-title" className="text-sm font-semibold text-gray-900">
          Discard unsaved changes?
        </h3>
        <p className="mt-2 text-xs text-gray-600">Your edits will be lost.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
