import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { colors, typography } from "../design/tokens";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useResizableModal } from "../hooks/useResizableModal";
import { ConfirmDiscardDialog } from "./dialogs/ConfirmDiscardDialog";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** When true, Escape / backdrop / Close attempt confirm before closing if `isDirty` */
  confirmDiscardOnClose?: boolean;
  isDirty?: boolean;
  /** Set to the same confirm-aware close used for Escape (e.g. wire footer Cancel). */
  onRegisterAttemptClose?: (attemptClose: () => void) => void;
  /** Passed through to `ConfirmDiscardDialog` when dirty-close triggers. */
  discardDialogTitle?: string;
  discardDialogMessage?: string;
  discardDialogButtonLabel?: string;
  /**
   * Optional wider default than create modals (still capped to viewport).
   * Ignored when `resizable` is true (size comes from `useResizableModal`).
   */
  panelMaxClassName?: string;
  /** SE-corner resize handle; persists size under `ih35.modalSize.{storageKey}`. */
  resizable?: boolean;
  /** Required when `resizable`; stable per modal type. */
  resizableStorageKey?: string;
};

export function Modal({
  open,
  onClose,
  title,
  children,
  confirmDiscardOnClose = false,
  isDirty = false,
  onRegisterAttemptClose,
  discardDialogTitle,
  discardDialogMessage,
  discardDialogButtonLabel,
  panelMaxClassName = "max-w-[min(42rem,calc(100vw-2rem))]",
  resizable = false,
  resizableStorageKey,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const resize = useResizableModal({
    enabled: open && resizable,
    modalKey: resizableStorageKey ?? "modal-generic",
    minWidth: 360,
    minHeight: 280,
    defaultWidth: 900,
    defaultHeight: Math.min(720, typeof window !== "undefined" ? Math.round(window.innerHeight * 0.85) : 640),
  });

  const finalizeClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const attemptClose = useCallback(() => {
    if (confirmDiscardOnClose && isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [confirmDiscardOnClose, isDirty, onClose]);

  useEscapeKey(attemptClose, open);

  useEffect(() => {
    if (!onRegisterAttemptClose) return;
    onRegisterAttemptClose(attemptClose);
    return () => onRegisterAttemptClose(() => {});
  }, [onRegisterAttemptClose, attemptClose]);

  useEffect(() => {
    if (!open) setShowDiscardConfirm(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const firstInput = panel?.querySelector<HTMLElement>("input, select, textarea, button");
    firstInput?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onMouseDown={attemptClose}
      >
        <div
          ref={panelRef}
          className={`relative flex max-h-[min(90vh,calc(100dvh-2rem))] w-full flex-col rounded-lg bg-white shadow-xl ${resizable ? "" : panelMaxClassName}`}
          style={
            resizable
              ? { width: resize.size.w, height: resize.size.h, maxWidth: "calc(100vw - 2rem)", maxHeight: "min(90vh, calc(100dvh - 2rem))" }
              : undefined
          }
          onMouseDown={(event) => event.stopPropagation()}
        >
          {resizable ? (
            <div
              {...resize.resizeHandleProps}
              className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm border border-gray-300 bg-gray-100 hover:bg-gray-200"
              aria-label="Resize modal"
            />
          ) : null}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2
              className="uppercase"
              style={{ fontSize: typography.panelHeader, color: colors.bodyText, letterSpacing: typography.tightUpper }}
            >
              {title}
            </h2>
            <button className="text-[11px] text-gray-500 hover:text-gray-700" onClick={attemptClose} type="button">
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        </div>
      </div>
      <ConfirmDiscardDialog
        open={showDiscardConfirm}
        onCancel={() => setShowDiscardConfirm(false)}
        onDiscard={finalizeClose}
        title={discardDialogTitle}
        message={discardDialogMessage}
        discardButtonLabel={discardDialogButtonLabel}
      />
    </>,
    document.body
  );
}
