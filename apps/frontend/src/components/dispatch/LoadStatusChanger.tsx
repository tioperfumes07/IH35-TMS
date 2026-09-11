import { useEffect, useMemo, useRef, useState } from "react";
import type { LoadStatus } from "../../api/loads";
import { getOfficeTransitionButtons, loadCanMarkInvoiced } from "@ih35/shared-types";
import { STATUS_LABEL } from "./constants";

// REG-054 (owner 2026-09-10, verbatim): "in all book loads and loads when opening or closing, in any
// view, i need to have a change status button like quickbooks, you click on it and drop down ... and to
// close a load the same, find a correct design." The owner had already asked for this on the loadboard
// (INLINE-STATUS-CHANGER, 2026-09-09) — InlineStatusPicker shipped it on the Kanban rows only. This is
// the same QuickBooks-style control mounted in the LOAD-DETAIL HEADER so it rides every tab of every
// load view (Load Costs page + dispatch drawer), for opening AND closing a load.
//
// The options are STATUS-AWARE — sourced from getOfficeTransitionButtons(status) (the shared state
// machine's legal office transitions from the current status), never a fixed list, so an illegal move
// is never even offered. "Mark invoiced" appears only when the load sits at completed_docs_received
// (loadCanMarkInvoiced) — the mdata lifecycle write. "Cancel load" opens the reason-required
// CancelLoadModal (a distinct money-aware void, never a bare status flip). The single money-aware
// writer (api/loads.ts updateLoadStatus → dispatch transition / mdata lifecycle) still validates and
// posts the driver-bill / settlement hooks — this control only chooses the target.

const CANCELLABLE_STATUS_EXCLUDED = new Set<string>([
  "cancelled",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
]);

type Props = {
  loadId: string;
  status: LoadStatus;
  pending?: boolean;
  disabled?: boolean;
  onTransition: (target: LoadStatus) => void;
  onMarkInvoiced: () => void;
  onCancelLoad: () => void;
};

function triggerClass(status: LoadStatus, interactive: boolean): string {
  const terminalMoney =
    status === "cancelled" ||
    status === "abandoned" ||
    status === "driver_walkoff" ||
    status === "driver_no_show";
  const base = terminalMoney
    ? "border-red-300 bg-red-50 text-red-700"
    : "border-gray-300 bg-gray-50 text-[#4B5563]";
  return `inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-xs font-semibold uppercase ${base} ${
    interactive ? "cursor-pointer hover:brightness-95" : "cursor-default opacity-90"
  }`;
}

export function LoadStatusChanger({
  loadId,
  status,
  pending,
  disabled,
  onTransition,
  onMarkInvoiced,
  onCancelLoad,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const transitions = useMemo(() => getOfficeTransitionButtons(String(status ?? "").trim()), [status]);
  const canInvoice = loadCanMarkInvoiced(String(status ?? "").trim());
  const canCancel = !CANCELLABLE_STATUS_EXCLUDED.has(String(status ?? "").trim());
  const hasActions = transitions.length > 0 || canInvoice || canCancel;
  const interactive = !disabled && !pending && hasActions;

  // TRAPPING-PICKER LAW (J1): dismiss on outside click / Escape — never a picker that only closes on
  // re-select.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={!interactive}
        data-testid={`load-status-changer-${loadId}`}
        className={triggerClass(status, interactive)}
        onClick={(event) => {
          event.stopPropagation();
          if (interactive) setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={interactive ? "Change load status" : "Status"}
      >
        <span>{STATUS_LABEL[status] ?? status}</span>
        {interactive ? (
          <span aria-hidden className="text-xs leading-none">
            {pending ? "…" : "▾"}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="menu"
          data-testid={`load-status-changer-menu-${loadId}`}
          className="absolute left-0 z-40 mt-1 min-w-[200px] rounded-sm border border-gray-200 bg-white py-1 shadow-lg"
        >
          <div className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#4B5563]">Change status</div>
          {transitions.map((t) => (
            <button
              key={t.target}
              type="button"
              role="menuitem"
              data-testid={`load-status-changer-option-${loadId}-${t.target}`}
              className="block w-full px-3 py-1 text-left text-xs text-gray-800 hover:bg-slate-100"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onTransition(t.target as LoadStatus);
              }}
            >
              {t.label}
            </button>
          ))}
          {canInvoice ? (
            <button
              type="button"
              role="menuitem"
              data-testid={`load-status-changer-option-${loadId}-invoiced`}
              className="block w-full px-3 py-1 text-left text-xs text-gray-800 hover:bg-slate-100"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onMarkInvoiced();
              }}
            >
              Mark invoiced
            </button>
          ) : null}
          {transitions.length === 0 && !canInvoice && !canCancel ? (
            <div className="px-3 py-1 text-xs text-gray-400">No status change available</div>
          ) : null}
          {canCancel ? (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                role="menuitem"
                data-testid={`load-status-changer-option-${loadId}-cancel`}
                className="block w-full px-3 py-1 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onCancelLoad();
                }}
              >
                Cancel load…
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
