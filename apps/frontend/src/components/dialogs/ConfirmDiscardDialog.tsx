import { createPortal } from "react-dom";
import { Button } from "../Button";

type Props = {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  /** Override default title (e.g. settlement close draft). */
  title?: string;
  /** Override default body copy. */
  message?: string;
  /** Label for the confirm button (default: Discard). */
  discardButtonLabel?: string;
};

/**
 * Blocking confirm over an open modal. Renders at z-index above `Modal` (z-50).
 */
export function ConfirmDiscardDialog({
  open,
  onCancel,
  onDiscard,
  title = "Discard unsaved changes?",
  message = "Your edits will be lost.",
  discardButtonLabel = "Discard",
}: Props) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
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
          {title}
        </h3>
        <p className="mt-2 text-xs text-gray-600">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onDiscard}>
            {discardButtonLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
