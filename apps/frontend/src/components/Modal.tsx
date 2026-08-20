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
import "../styles/proportion-chrome.css";

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
   * NAV-BACK-NESTED-CREATE — optional explicit back handler. On `variant="drawer"`, a ← affordance
   * always appears (ParityDrawer parity); when omitted it uses the same confirm-aware close as ✕.
   * Centered cards never show ← (confirm/detail dialogs stay chrome-unchanged).
   */
  onBack?: () => void;
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
  onBack,
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

  useEscapeKey(() => {
    // WO-CREATE-UX: Escape on an open Combobox list or nested QuickCreate must not discard the parent wizard.
    if (document.querySelector('[data-combobox-listbox="portal"]')) return;
    if (document.querySelector('[data-parity-drawer-stack-above-modal="true"]')) return;
    attemptClose();
  }, open);

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
          // z-[215]: above every other z-[N] tier in the frontend, including the highest drawer
          // (LoadDetailDrawer, z-[210]) — CANCEL-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER. This Modal renders
          // through its own createPortal to document.body (so parent overflow/transform never clips it —
          // this was never a positioning bug), but the OLD z-[70] sat a full tier below LoadDetailDrawer's
          // z-[210]: both are portaled siblings under <body>, so the drawer's opaque panel painted on top
          // of and obscured any Modal opened from inside it (e.g. CancelLoadModal's "Cancel Load" button)
          // — the modal's form controls existed in the DOM and were focusable/functional, just invisible.
          // Stays BELOW Combobox.tsx's LISTBOX_Z_INDEX=220 so a ReferenceSelect/Combobox dropdown opened
          // inside this Modal (e.g. the cancellation-reason picker) still paints above the Modal itself.
          isDrawer
            ? "fixed inset-0 z-[215] flex justify-end bg-black/50"
            : "fixed inset-0 z-[215] flex items-center justify-center bg-black/50 p-4"
        }
        onMouseDown={attemptClose}
      >
        <div
          ref={panelRef}
          // FAIL-B1 — a nested "+ Create" submitted the PARENT wizard. This modal renders through
          // `createPortal`, so its DOM lives outside the wizard's <form> — but React propagates events
          // through the REACT tree, not the DOM tree, so a submit inside the modal still reaches the
          // outer `<form onSubmit>` that is its React ancestor. Booking a load by opening a create drawer
          // is a real write, not a cosmetic glitch.
          // Several forms already patched this INDIVIDUALLY (CreateDriverModal, the parity drawers) — and
          // a census found FIVE that had not: W8BenModal, AddTrainingModal, QuickAssignModal,
          // CreateTrailerModal and VendorCreateModal, the last two reachable straight from Book Load.
          // Per-form guards are whack-a-mole and every NEW create form starts unguarded, so the stop
          // belongs here, once. A child form's own onSubmit still runs first; only the bubble is cut.
          onSubmit={(event) => event.stopPropagation()}
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
          data-proportion-chrome="qbo-compact"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div
            className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3"
            data-proportion-chrome-header=""
          >
            <div className="flex min-w-0 items-center gap-2">
              {isDrawer ? (
                <button
                  type="button"
                  aria-label="Back to previous surface"
                  data-testid="modal-drawer-back"
                  onClick={onBack ?? attemptClose}
                  className="min-h-11 shrink-0 rounded-sm px-2 text-lg text-gray-600 hover:bg-gray-100 sm:min-h-0"
                >
                  ←
                </button>
              ) : null}
              <h2
                className="min-w-0 truncate uppercase"
                style={{ fontSize: typography.panelHeader, color: colors.bodyText, letterSpacing: typography.tightUpper }}
              >
                {title}
              </h2>
            </div>
            <ModalCloseButton title={title} onClose={attemptClose} />
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3">{children}</div>
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
