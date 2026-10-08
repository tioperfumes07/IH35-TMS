import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onAcknowledge: () => void;
  /** Column inversion: short > practical on the same lane direction. */
  columnInverted: boolean;
  /** Reverse-lane short miles differ by >100mi (MILES-INVERT-01 catalog trigger). */
  reverseLaneShortDiff: boolean;
};

/**
 * MILES-INVERT-01 — OK-only acknowledgment. Operator must press OK; no Esc, backdrop, or X dismiss.
 * Owner UX locked 2026-09-02 · Jorge.
 */
export function MilesInvertAckDialog({ open, onAcknowledge, columnInverted, reverseLaneShortDiff }: Props) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    okRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[225] flex items-center justify-center bg-black/50 p-4"
      data-testid="miles-invert-ack-dialog"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="w-full max-w-md rounded-sm border border-[#E5E7EB] bg-white shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="miles-invert-ack-title"
        aria-describedby="miles-invert-ack-body"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[#E5E7EB] px-4 py-3">
          <h2 id="miles-invert-ack-title" className="text-xs font-semibold uppercase tracking-wide text-[#0F1219]">
            Check lane miles
          </h2>
        </div>
        <div id="miles-invert-ack-body" className="space-y-2 px-4 py-3 text-xs text-[#1F2A44]">
          {columnInverted ? (
            <p>
              History filled short miles higher than practical miles on this lane. Short miles pay the driver — verify
              them before you book. CC-1 is remediating the catalog so short means shortest route again.
            </p>
          ) : null}
          {reverseLaneShortDiff ? (
            <p>
              Short miles on this lane and the reverse direction differ by more than 100 miles. Opposite lanes should
              have essentially the same loaded short miles — verify short miles before you book.
            </p>
          ) : null}
          <p className="font-medium text-[#0F1219]">
            Driver pay uses short miles. Customer revenue per mile uses practical miles. Company cost uses practical plus
            empty miles.
          </p>
        </div>
        <div className="flex justify-end border-t border-[#E5E7EB] px-4 py-3">
          <button
            ref={okRef}
            type="button"
            data-testid="miles-invert-ack-ok"
            className="rounded-sm bg-[#1F2A44] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F1219]"
            onClick={onAcknowledge}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
