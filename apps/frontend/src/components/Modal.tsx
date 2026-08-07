import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { getUserPreferences } from "../api/safety";
import { colors, typography } from "../design/tokens";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { MODAL_MIN_BY_PRESET, readModalSizeFromPrefs, persistModalSize, type ModalSizePreset } from "../lib/modal-size-prefs";
import { ConfirmDiscardDialog } from "./dialogs/ConfirmDiscardDialog";
import { ModalCloseButton } from "./ModalCloseButton";
import { PARITY_CREATE_DRAWER_WIDTH } from "./parity/sizing";
import { ResizeHandle } from "./ui/ResizeHandle";

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
  /** Persisted size key (`preferences.ui.modal_sizes`). */
  modalKind?: string;
  sizePreset?: ModalSizePreset;
  /** Enable bottom-right resize grip (requires `modalKind` + `sizePreset`). */
  resizable?: boolean;
  /** Opt-in wide layout (~1140px) for two-column form modals (e.g. Create Work Order render-v5). */
  wide?: boolean;
  /**
   * C7 — dialog shape.
   *
   * `"center"` (default, unchanged) keeps the historic centered card. Every non-create dialog in
   * the product — confirm, preview, detail, success — stays exactly as it was.
   *
   * `"drawer"` is the shared 480px RIGHT drawer that every "+ Create"/"+ Book" surface opens in.
   * It is deliberately the SAME component, not a second shell, so the focus trap, the Escape
   * handling and the unsaved-changes (ConfirmDiscardDialog) guard below are inherited identically
   * by both shapes and cannot drift apart.
   *
   * Nested create stacks drawer-on-drawer: this component portals to `document.body` and its
   * overlay is `z-50`, above ParityDrawer's `z-40` money side-panel, so a create opened FROM a
   * money drawer lands on top of it instead of behind it (VERIFY-1). Owner-ratified exceptions
   * that stay WIDE WIZARDS rather than drawers: Book Load and Create Work Order.
   */
  variant?: "center" | "drawer";
};

export function Modal({
  open,
  onClose,
  title,
  children,
  confirmDiscardOnClose = false,
  isDirty = false,
  onRegisterAttemptClose,
  modalKind,
  sizePreset,
  resizable = false,
  wide = false,
  variant = "center",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const boxRef = useRef<{ w: number; h: number } | null>(null);

  const isDrawer = variant === "drawer";
  // The create drawer is a fixed-width right panel, so the persisted free-resize box (which sizes a
  // centered card) does not apply to it — persisting a w/h here would fight the 480px contract.
  const useCustomSize = Boolean(modalKind && sizePreset) && !isDrawer;
  // Unchanged for the centered card (the `|| true` predates C7); the fixed-width drawer opts out.
  const resizeEnabled = (resizable || true) && !isDrawer;
  const minBox = sizePreset ? MODAL_MIN_BY_PRESET[sizePreset] : { w: 320, h: 240 };

  const prefsQuery = useQuery({
    queryKey: ["user", "preferences"],
    queryFn: getUserPreferences,
    enabled: open && resizeEnabled && useCustomSize,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open || !resizeEnabled) {
      setBox(null);
      return;
    }
    if (!useCustomSize || !modalKind || !sizePreset) {
      setBox(null);
      boxRef.current = null;
      return;
    }
    const stored = readModalSizeFromPrefs(prefsQuery.data?.preferences as Record<string, unknown> | undefined, modalKind);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const min = MODAL_MIN_BY_PRESET[sizePreset];
    const fallbackW = Math.min(Math.max(vw * 0.85, min.w), vw * 0.92);
    const fallbackH = Math.min(Math.max(vh * 0.72, min.h), vh * 0.92);
    const w = Math.max(min.w, Math.min(stored?.w ?? fallbackW, vw * 0.95));
    const h = Math.max(min.h, Math.min(stored?.h ?? fallbackH, vh * 0.95));
    const next = { w, h };
    setBox(next);
    boxRef.current = next;
  }, [open, resizeEnabled, useCustomSize, modalKind, sizePreset, prefsQuery.data]);

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

  const panelStyle: CSSProperties | undefined = box
    ? { width: box.w, height: box.h, maxWidth: "min(95vw, calc(100vw - 2rem))", maxHeight: "min(95vh, calc(100dvh - 2rem))" }
    : undefined;

  if (!open) return null;

  return createPortal(
    <>
      <div
        className={
          // z-[70] above ParityDrawer (z-[60]) and page wizards (z-50) so nested +Create unit/driver
          // from Book Load / money drawers receive clicks — never the parent backdrop.
          isDrawer
            ? "fixed inset-0 z-[70] flex justify-end bg-black/50"
            : "fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
        }
        onMouseDown={attemptClose}
      >
        <div
          ref={panelRef}
          className={
            isDrawer
              ? `relative flex h-full max-h-full flex-col border-l border-gray-200 bg-white shadow-xl ${PARITY_CREATE_DRAWER_WIDTH}`
              : `relative flex flex-col rounded-lg bg-white shadow-xl ${
                  box
                    ? "overflow-hidden"
                    : wide
                      ? "max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-[min(72rem,calc(100vw-2rem))]"
                      : "max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-[min(42rem,calc(100vw-2rem))]"
                }`
          }
          style={isDrawer ? undefined : panelStyle}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-modal-variant={variant}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2
              className="uppercase"
              style={{ fontSize: typography.panelHeader, color: colors.bodyText, letterSpacing: typography.tightUpper }}
            >
              {title}
            </h2>
            <ModalCloseButton title={title} onClose={attemptClose} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
          {resizeEnabled ? (
            <ResizeHandle
              onPointerDrag={(dx, dy) => {
                setBox((prev) => {
                  const base =
                    prev ??
                    (() => {
                      const rect = panelRef.current?.getBoundingClientRect();
                      if (!rect) return { w: 672, h: 420 };
                      return { w: rect.width, h: rect.height };
                    })();
                  const vw = window.innerWidth;
                  const vh = window.innerHeight;
                  const nextW = Math.max(minBox.w, Math.min(base.w + dx, vw * 0.95));
                  const nextH = Math.max(minBox.h, Math.min(base.h + dy, vh * 0.95));
                  const next = { w: nextW, h: nextH };
                  boxRef.current = next;
                  return next;
                });
              }}
              onPointerDone={() => {
                if (!useCustomSize || !modalKind) return;
                const b = boxRef.current;
                if (!b) return;
                void persistModalSize(modalKind, b).catch(() => undefined);
              }}
            />
          ) : null}
        </div>
      </div>
      <ConfirmDiscardDialog
        open={showDiscardConfirm}
        onCancel={() => setShowDiscardConfirm(false)}
        onDiscard={finalizeClose}
      />
    </>,
    document.body
  );
}
